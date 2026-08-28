--  ARCH-01 (AR-014): the AWS callback glue.  This body is deliberately
--  thin: HTTP dispatch, route handlers, response encoding, concurrency
--  state (entity locks, idempotency LRU), and game-settings startup
--  loading.  Everything else lives in a concern package:
--    Pitd_Common      shared primitives, entity storage, history metadata,
--                     game-settings cache, game-derived helpers, envelopes
--    Pitd_Stored      stored-entity classification (SC-A3)
--    Pitd_Normalize   canonicalizer, import/repair preview, tokens (SC-A1/A2)
--    Pitd_Summary     collection summaries, completeness, roster (SC-A4)
--    Pitd_Capability  capability projections + claim lookup (SC-A5/A15)
--    Pitd_Ops         request validation and operation routing
--  Pure structural extraction; behavior lives where it always did.
with Ada.Calendar;
with Ada.Directories;
with Ada.Streams;
with Ada.Exceptions;
with Ada.Strings.Fixed;
with Ada.Strings.Unbounded;
with Ada.Text_IO;

with AWS.Headers;
with AWS.Messages;
with AWS.MIME;
with AWS.Response;
with AWS.Response.Set;
with AWS.Status;
with AWS.URL;
with GNAT.SHA256;
with GNATCOLL.JSON;
with Paperclips_Core;
with Pitd_Common;
with Pitd_Capability;
with Pitd_Normalize;
with Pitd_Ops;
with Pitd_Summary;
with Pitd_Error;
with Pitd_Stored;

package body Pitd_Callback is
   use Ada.Strings.Unbounded;
   use GNATCOLL.JSON;
   use Pitd_Common;
   use Pitd_Capability;
   use Pitd_Normalize;
   use Pitd_Ops;
   use Pitd_Summary;
   use Pitd_Error;
   use Pitd_Stored;
   use type Ada.Calendar.Time;
   use type AWS.Status.Request_Method;
   use type Ada.Directories.File_Kind;

   function Json_Response
     (Value : JSON_Value; Status : AWS.Messages.Status_Code := AWS.Messages.S200)
      return AWS.Response.Data is
     (AWS.Response.Build ("application/json; charset=utf-8", String'(Write (Value, Compact => False)) & ASCII.LF, Status));

   function Json_Text
     (Value : String; Status : AWS.Messages.Status_Code := AWS.Messages.S200)
      return AWS.Response.Data is
     (AWS.Response.Build ("application/json; charset=utf-8", Value, Status));

   function Fail (Status : AWS.Messages.Status_Code; Op, Code : String;
                  Entity : JSON_Value := JSON_Null; Message : String := "not found")
                  return AWS.Response.Data is
     (Json_Response (Error_Result (Op, Code, Message, Entity), Status));

   Static_Root : Unbounded_String := To_Unbounded_String ("./frontend/dist");
   --  Data_Root / Games_Root live in Pitd_Common (shared with storage).
   Hooks       : Boolean := False;

   --  BUG-001: per-entity lock registry.  Mutations of the SAME entity
   --  serialize on that entity's slot (held across read+mutate+snapshot+
   --  write and released on every exit path and exception), while different
   --  entities claim different slots and proceed in parallel.  The protected
   --  entry barrier makes a second claimant for a held entity wait; the
   --  registry only ever rejects a claim when all slots are busy (bounded).
   Max_Entity_Locks : constant := 64;
   type Entity_Lock_Entry is record
      Id       : Unbounded_String;   --  empty when the slot is free
      Held     : Boolean := False;
      Revision : Integer := -1;      --  revision observed at claim time
   end record;
   Entity_Lock_Table : array (1 .. Max_Entity_Locks) of Entity_Lock_Entry :=
     (others => (Null_Unbounded_String, False, -1));

   protected Entity_Lock_Registry is
      procedure Claim (Id : String; Revision : Integer; Granted : out Boolean);
      procedure Release (Id : String);
   private
      function Index_Of (Id : String) return Natural;
   end Entity_Lock_Registry;

   protected body Entity_Lock_Registry is
      function Index_Of (Id : String) return Natural is
      begin
         for I in Entity_Lock_Table'Range loop
            if To_String (Entity_Lock_Table (I).Id) = Id then return I; end if;
         end loop;
         return 0;
      end Index_Of;

      --  A protected entry barrier cannot reference entry parameters, so the
      --  registry exposes a test-and-set procedure; the caller retries with a
      --  small delay until the entity's slot is granted (bounded spin, no
      --  busy-waiting on a held slot).
      procedure Claim (Id : String; Revision : Integer; Granted : out Boolean) is
      begin
         Granted := False;
         declare
            Idx : constant Natural := Index_Of (Id);
         begin
            if Idx /= 0 then
               if not Entity_Lock_Table (Idx).Held then
                  Entity_Lock_Table (Idx).Held := True;
                  Entity_Lock_Table (Idx).Revision := Revision;
                  Granted := True;
               end if;
            else
               for I in Entity_Lock_Table'Range loop
                  if not Entity_Lock_Table (I).Held then
                     Entity_Lock_Table (I) :=
                       (To_Unbounded_String (Id), True, Revision);
                     Granted := True;
                     exit;
                  end if;
               end loop;
            end if;
         end;
      end Claim;

      procedure Release (Id : String) is
         Idx : constant Natural := Index_Of (Id);
      begin
         if Idx /= 0 then
            Entity_Lock_Table (Idx) := (Null_Unbounded_String, False, -1);
         end if;
      end Release;
   end Entity_Lock_Registry;

   --  BUG-002: bounded LRU of idempotent mutation results, keyed by
   --  method+route+entityId+Idempotency-Key with a SHA-256 hash of the raw
   --  body.  An exact retry replays the stored response; a same-scope key
   --  with a different body hash is rejected as 409 VALIDATION (ok:false).
   --  At most 32 entries; the oldest (least recently used) is evicted.
   Max_Idempotency_Entries : constant := 32;
   type Idempotency_Entry is record
      Key      : Unbounded_String;
      Hash     : Unbounded_String;
      Response : Unbounded_String;
      Used     : Natural := 0;
   end record;
   Idempotency_Table : array (1 .. Max_Idempotency_Entries) of Idempotency_Entry :=
     (others => (Null_Unbounded_String, Null_Unbounded_String, Null_Unbounded_String, 0));

   protected Idempotency_Store is
      procedure Lookup
        (Key, Hash : String; Found, Match : out Boolean; Response : out Unbounded_String);
      procedure Store (Key, Hash, Response : String);
   private
      Tick : Natural := 0;
   end Idempotency_Store;

   protected body Idempotency_Store is
      procedure Lookup
        (Key, Hash : String; Found, Match : out Boolean; Response : out Unbounded_String)
      is
      begin
         Found := False;
         Match := False;
         Response := Null_Unbounded_String;
         Tick := Tick + 1;
         for I in Idempotency_Table'Range loop
            if To_String (Idempotency_Table (I).Key) = Key then
               Found := True;
               Match := To_String (Idempotency_Table (I).Hash) = Hash;
               if Match then Response := Idempotency_Table (I).Response; end if;
               Idempotency_Table (I).Used := Tick;
               return;
            end if;
         end loop;
      end Lookup;

      procedure Store (Key, Hash, Response : String) is
         Slot : Natural := 0;
      begin
         Tick := Tick + 1;
         for I in Idempotency_Table'Range loop
            if To_String (Idempotency_Table (I).Key) = Key then
               Idempotency_Table (I).Hash := To_Unbounded_String (Hash);
               Idempotency_Table (I).Response := To_Unbounded_String (Response);
               Idempotency_Table (I).Used := Tick;
               return;
            end if;
         end loop;
         for I in Idempotency_Table'Range loop
            if Length (Idempotency_Table (I).Key) = 0 then
               Slot := I;
               exit;
            end if;
         end loop;
         if Slot = 0 then
            Slot := Idempotency_Table'First;
            for I in Idempotency_Table'First + 1 .. Idempotency_Table'Last loop
               if Idempotency_Table (I).Used < Idempotency_Table (Slot).Used then
                  Slot := I;
               end if;
            end loop;
         end if;
         Idempotency_Table (Slot).Key := To_Unbounded_String (Key);
         Idempotency_Table (Slot).Hash := To_Unbounded_String (Hash);
         Idempotency_Table (Slot).Response := To_Unbounded_String (Response);
         Idempotency_Table (Slot).Used := Tick;
      end Store;
   end Idempotency_Store;







   --  SC-A5: published service capability (contract/openapi.yaml
   --  ServiceCapabilities.maxBatchOperations): the campaign/batch planner is
   --  sized and bounded by this single constant.
   Max_Batch_Operations : constant := 50;



   function Path_Only (URI : String) return String is
      Q : Natural := 0;
   begin
      for I in URI'Range loop
         if URI (I) = '?' then Q := I; exit; end if;
      end loop;
      return (if Q = 0 then URI elsif Q = URI'First then "/"
              else URI (URI'First .. Q - 1));
   end Path_Only;

   function Query_Of (URI : String) return String is
   begin
      for I in URI'Range loop
         if URI (I) = '?' then
            return (if I = URI'Last then "" else URI (I + 1 .. URI'Last));
         end if;
      end loop;      return "";
   end Query_Of;

   --  SC-A2: preview-mode detection from the raw query string.
   --  AWS.Status.Parameter is NOT used here: it parses the whole POST body
   --  as URL-encoded parameters, which rejects bodies without '&' above the
   --  input-line limit (1 MiB payloads would never reach the handler).
   function Has_Preview (Q : String) return Boolean is
      P : Natural := Q'First;
   begin
      if Q'Length < 9 then return False; end if;
      loop
         declare
            E : Natural := P;
         begin
            while E <= Q'Last and then Q (E) /= '&' loop
               E := E + 1;
            end loop;
            if E - P >= 9 and then Q (P .. P + 8) = "preview=1" then
               return True;
            end if;
            exit when E > Q'Last;
            P := E + 1;
         end;
      end loop;
      return False;
   end Has_Preview;


   function Slashes (Path : String) return Natural is
      N : Natural := 0;
   begin
      for C of Path loop if C = '/' then N := N + 1; end if; end loop;
      return N;
   end Slashes;

   function Part (Path : String; Number : Positive) return String is
      Start : Natural := Path'First;
      Seen  : Natural := 0;
   begin
      while Start <= Path'Last and then Path (Start) = '/' loop Start := Start + 1; end loop;
      for I in Start .. Path'Last + 1 loop
         if I > Path'Last or else Path (I) = '/' then
            Seen := Seen + 1;
            if Seen = Number then
               return (if I = Start then "" else Path (Start .. I - 1));
            end if;
            Start := I + 1;
         end if;
      end loop;
      return "";
   end Part;






   function Normalization_Required_Result
     (Op : String; Preview : JSON_Value; Warnings, Needs : JSON_Array; Token : String)
      return JSON_Value is
     (Normalization_Required_Error (Op, Preview, Warnings, Needs, Token));

   function Invalid_Entry_Result (Op : String; Issues : JSON_Array) return JSON_Value is
     (Invalid_Entry_Error (Op, Issues));

   function Stale_Result
     (Op : String; Entity : JSON_Value;
      Current_Revision : Integer; Current_Token : String := "")
      return JSON_Value is
     (Stale_Error (Op, Entity, Current_Revision, Current_Token));

   function Confirm_Required_Result (Op : String; Entity : JSON_Value) return JSON_Value is
     (Confirm_Required_Error (Op, "confirm must be true", Entity));

   function Payload_Too_Large_Result (Op : String; Received : Natural) return JSON_Value is
     (Payload_Too_Large_Error (Op, "request exceeds the 1 MiB payload cap",
                               Integer (Max_Import), Integer (Received)));

   --  SC-A2: request bodies above Max_Import are refused with the frozen
   --  PAYLOAD_TOO_LARGE union (413), not the legacy VALIDATION code.
   Payload_Too_Large : exception;

   --  SC-A3: malformed transport JSON (unparseable body bytes) is a 400
   --  VALIDATION with pointer details at the transport boundary — never a
   --  raw exception or a 500.
   Malformed_JSON : exception;

   function Parse_Body (Body_Text : String) return JSON_Value is
   begin
      if Body_Text'Length > Max_Import then
         raise Payload_Too_Large with "request exceeds 1 MiB";
      end if;
      if Body_Text = "" then return Create_Object; end if;
      begin
         return Read (Body_Text);
      exception
         when others =>
            raise Malformed_JSON with "request body is not valid JSON";
      end;
   end Parse_Body;

   function Header (Request : AWS.Status.Data; Name : String) return String is
     (AWS.Headers.Get_Values (AWS.Status.Header (Request), Name));




   --  Frozen INVALID_ENTITY result body: ok:false with the typed error
   --  union variant {code, status: 422, message, retryable, recovery,
   --  details.issues} (operation-result.json $defs/operationError).
   function Invalid_Entity_Result (Op : String; Issues : JSON_Array) return JSON_Value is
     (Invalid_Entity_Error (Op, Issues));


















   ---------------------------------------------------------------------------
   --  CONTRACT-01 stage 2 (DEC-01 ruling): dedicated validated PC creation
   --  path, POST /api/characters/pc.  Mirrors the sibling createCharacter
   --  flow (shared template -> schema validator gate -> atomic write ->
   --  baseline snapshot; no If-Match, x-snapshot false) and ADDS
   --  settings-derived Talent validation before anything is written:
   --    V1  sum(actionRatings) = StartingActionDots exactly
   --    V2  every rating <= StartingActionDotMax
   --    V3  playbook exists in the game's Playbooks
   --    V4  actionRatings names exactly the game's published actions
   --  Every bound is read from the requested game's loaded settings JSON at
   --  request time -- no constant may appear here (spec 5).  A game whose
   --  settings omit either budget key has not published a PC allocation
   --  budget: 404 NOT_FOUND naming the absent keys
   --  (C1PC-SETTING-ABSENT-001).  Unknown stems keep the shared create
   --  semantics: GAME_NOT_FOUND as a 200-status domain failure (SC-A3).
   --  The unvalidated POST /characters path is untouched (grandfathering).
   function Handle_Pc_Create (Request : AWS.Status.Data) return AWS.Response.Data is
      Op : constant String := "character.createPc";
   begin
      if AWS.Status.Method (Request) /= AWS.Status.POST then
         return Fail (AWS.Messages.S404, "request", "NOT_FOUND");
      end if;
      declare
         B   : constant JSON_Value :=
           Parse_Body (To_String (AWS.Status.Binary_Data (Request)));
         Bad : Unbounded_String;
      begin
         if not Validate_Request ("character", Op, B, Bad) then
            return Fail (AWS.Messages.S400, Op, "VALIDATION",
                         Message => To_String (Bad));
         end if;
         declare
            Stem     : constant String := Str_Field (B, "gameStem");
            Playbook : constant String := Str_Field (B, "playbook");
            G        : constant JSON_Value := Game (Stem);
            --  CONTRACT-01 / DEC-01 ruling: per-playbook starting dots are
            --  settings data (C# reference GameSettingExtensions.cs:38
            --  DefaultActionPoints(gameSetting, playbook, action)). Returns
            --  0 when the playbook carries no entry for the action — the
            --  same "absent means zero" convention as the C# source.
            function Default_Points_For (Action_Name : String) return Natural is
            begin
               if Has_Field (G, "Playbooks") then
                  declare
                     PBs : constant JSON_Array := Get (G, "Playbooks");
                  begin
                     for I in 1 .. Length (PBs) loop
                        declare
                           PB : constant JSON_Value := Get (PBs, I);
                        begin
                           if Str_Field (PB, "Name") = Playbook
                             and then Has_Field (PB, "DefaultActionPoints")
                             and then Get (PB, "DefaultActionPoints").Kind = JSON_Array_Type
                           then
                              declare
                                 DAPs : constant JSON_Array :=
                                   Get (PB, "DefaultActionPoints");
                              begin
                                 for J in 1 .. Length (DAPs) loop
                                    declare
                                       D : constant JSON_Value := Get (DAPs, J);
                                    begin
                                       if Str_Field (D, "Action") = Action_Name
                                         and then D.Kind = JSON_Object_Type
                                         and then Has_Field (D, "Points")
                                         and then Get (D, "Points").Kind = JSON_Int_Type
                                       then
                                          return Integer'Max
                                            (0, Integer'(Get (D, "Points")));
                                       end if;
                                    end;
                                 end loop;
                              end;
                           end if;
                        end;
                     end loop;
                  end;
               end if;
               return 0;
            end Default_Points_For;
         begin
            if G.Kind /= JSON_Object_Type then
               --  SC-A3: GAME_NOT_FOUND is a 200-status domain failure,
               --  not a request-shape error.
               return Json_Response
                 (Game_Not_Found_Error (Op, "unknown game stem: " & Stem));
            end if;

            --  Setting-absent behavior (C1PC-SETTING-ABSENT-001): a game
            --  that omits either budget key has not published a PC
            --  allocation budget, so this endpoint is unavailable for it.
            --  NOT_FOUND rather than VALIDATION: the gap is not fixable by
            --  changing the request body.
            declare
               Has_Dots : constant Boolean :=
                 Has_Field (G, "StartingActionDots")
                 and then Get (G, "StartingActionDots").Kind = JSON_Int_Type;
               Has_Max : constant Boolean :=
                 Has_Field (G, "StartingActionDotMax")
                 and then Get (G, "StartingActionDotMax").Kind = JSON_Int_Type;
               Missing : Unbounded_String := Null_Unbounded_String;
            begin
               if not Has_Dots then Append (Missing, "StartingActionDots"); end if;
               if not Has_Max then
                  if Length (Missing) > 0 then Append (Missing, ", "); end if;
                  Append (Missing, "StartingActionDotMax");
               end if;
               if Length (Missing) > 0 then
                  return Fail
                    (AWS.Messages.S404, Op, "NOT_FOUND",
                     Message => "game """ & Stem
                       & """ has not published a PC allocation budget: missing settings "
                       & To_String (Missing));
               end if;
            end;

            --  V3: playbook must exist in the game's Playbooks list.
            declare
               Known : Boolean := False;
            begin
               if Has_Field (G, "Playbooks") then
                  declare
                     PBs : constant JSON_Array := Get (G, "Playbooks");
                  begin
                     for I in 1 .. Length (PBs) loop
                        exit when Known;
                        Known := Str_Field (Get (PBs, I), "Name") = Playbook;
                     end loop;
                  end;
               end if;
               if not Known then
                  return Fail
                    (AWS.Messages.S400, Op, "VALIDATION",
                     Message => "unknown playbook """ & Playbook
                       & """: the game's Playbooks do not list it");
               end if;
            end;

            --  V4/V5/V2/V1 over actionRatings; every bound and default
            --  comes from settings (DEC-01: DefaultActionPoints enforced).
            declare
               Budget  : constant Integer := Integer'(Get (G, "StartingActionDots"));
               Max     : constant Integer := Integer'(Get (G, "StartingActionDotMax"));
               Ratings : constant JSON_Value := Get (B, "actionRatings");
               Bad_Name  : Unbounded_String := Null_Unbounded_String;
               Bad_Value : Unbounded_String := Null_Unbounded_String;
                 --  V5 conflict: submitted value for a defaulted action that
                 --  does not match the playbook default.
               Conflict_Name    : Unbounded_String := Null_Unbounded_String;
               Conflict_Default : Integer := 0;
               Over_Cap_Name   : Unbounded_String := Null_Unbounded_String;
               Over_Cap_Value : Integer := 0;
               Sum            : Natural := 0;

               function Published_Action (Name : String) return Boolean is
               begin
                  if not Has_Field (G, "Attributes") then return False; end if;
                  declare
                     Attrs : constant JSON_Array := Get (G, "Attributes");
                  begin
                     for I in 1 .. Length (Attrs) loop
                        if Has_Field (Get (Attrs, I), "Actions") then
                           declare
                              Acts : constant JSON_Array :=
                                Get (Get (Attrs, I), "Actions");
                           begin
                              for J in 1 .. Length (Acts) loop
                                 if Str_Field (Get (Acts, J), "Name") = Name then
                                    return True;
                                 end if;
                              end loop;
                           end;
                        end if;
                     end loop;
                  end;
                  return False;
               end Published_Action;

               procedure Scan_Rating (Key : UTF8_String; Value : JSON_Value) is
               begin
                  if not Published_Action (String (Key)) then
                     if Length (Bad_Name) = 0 then
                        Bad_Name := To_Unbounded_String (String (Key));
                     end if;
                  elsif Value.Kind /= JSON_Int_Type
                    or else Integer'(Get (Value)) < 0
                  then
                     if Length (Bad_Value) = 0 then
                        Bad_Value := To_Unbounded_String (String (Key));
                     end if;
                  end if;
               end Scan_Rating;

               Missing_Name : Unbounded_String := Null_Unbounded_String;
            begin
               Map_JSON_Object (Ratings, Scan_Rating'Access);
               if Length (Bad_Name) > 0 then
                  return Fail
                    (AWS.Messages.S400, Op, "VALIDATION",
                     Message => "unknown action """ & To_String (Bad_Name)
                       & """: actionRatings names must match the actions published by the game's Attributes");
               end if;
               if Length (Bad_Value) > 0 then
                  return Fail
                    (AWS.Messages.S400, Op, "VALIDATION",
                     Message => "actionRatings.""" & To_String (Bad_Value)
                       & """ must be a non-negative integer");
               end if;
               --  V4/V5 over the FINAL map (defaults ∪ submissions): every
               --  published action must be keyed after the overlay; a
               --  submitted value for a defaulted action must MATCH the
               --  playbook's DefaultActionPoints (DEC-01 ruling).
               if Has_Field (G, "Attributes") then
                  declare
                     Attrs : constant JSON_Array := Get (G, "Attributes");
                  begin
                     for I in 1 .. Length (Attrs) loop
                        exit when Length (Missing_Name) > 0
                          or else Length (Conflict_Name) > 0;
                        if Has_Field (Get (Attrs, I), "Actions") then
                           declare
                              Acts : constant JSON_Array :=
                                Get (Get (Attrs, I), "Actions");
                           begin
                              for J in 1 .. Length (Acts) loop
                                 declare
                                    Nm  : constant String :=
                                      Str_Field (Get (Acts, J), "Name");
                                    Def : constant Natural :=
                                      Default_Points_For (Nm);
                                 begin
                                    if Has_Field (Ratings, Nm) then
                                       declare
                                          V : constant Integer :=
                                            Integer'(Get (Ratings, Nm));
                                       begin
                                          if Def > 0 and then V /= Def then
                                             Conflict_Name :=
                                               To_Unbounded_String (Nm);
                                             Conflict_Default := Def;
                                          else
                                             Sum := Sum + V;
                                             if V > Max
                                               and then Length (Over_Cap_Name) = 0
                                             then
                                                Over_Cap_Name :=
                                                  To_Unbounded_String (Nm);
                                                Over_Cap_Value := V;
                                             end if;
                                          end if;
                                       end;
                                    elsif Def > 0 then
                                       --  Union fill: the default stands in.
                                       Sum := Sum + Def;
                                       if Def > Max
                                         and then Length (Over_Cap_Name) = 0
                                       then
                                          Over_Cap_Name :=
                                            To_Unbounded_String (Nm);
                                          Over_Cap_Value := Def;
                                       end if;
                                    else
                                       Missing_Name := To_Unbounded_String (Nm);
                                       exit;
                                    end if;
                                 end;
                              end loop;
                           end;
                        end if;
                     end loop;
                  end;
               end if;
               if Length (Conflict_Name) > 0 then
                  return Fail
                    (AWS.Messages.S400, Op, "VALIDATION",
                     Message => "actionRatings.""" & To_String (Conflict_Name)
                       & """ is " & Trim_Image (Integer'(Get (Ratings, To_String (Conflict_Name))))
                       & ", but the playbook's DefaultActionPoints give "
                       & Trim_Image (Conflict_Default)
                       & ": starting dots for a defaulted action must match the default exactly");
               end if;
               if Length (Missing_Name) > 0 then
                  return Fail
                    (AWS.Messages.S400, Op, "VALIDATION",
                     Message => "missing action """ & To_String (Missing_Name)
                       & """: actionRatings must map every action published by the game's Attributes"
                       & " (actions without a playbook DefaultActionPoints default cannot be omitted)");
               end if;
               --  V2: every rating <= StartingActionDotMax.
               if Length (Over_Cap_Name) > 0 then
                  return Fail
                    (AWS.Messages.S400, Op, "VALIDATION",
                     Message => "actionRatings.""" & To_String (Over_Cap_Name) & """ is "
                       & Trim_Image (Over_Cap_Value)
                       & "; StartingActionDotMax is " & Trim_Image (Max)
                       & ": starting ratings must not exceed the cap");
               end if;
               --  V1: sum(actionRatings) = StartingActionDots exactly.
               if Sum /= Budget then
                  return Fail
                    (AWS.Messages.S400, Op, "VALIDATION",
                     Message => "sum of actionRatings is " & Trim_Image (Sum)
                       & ", but StartingActionDots is " & Trim_Image (Budget)
                       & ": starting allocation must equal the budget exactly");
               end if;
            end;

            --  Validation passed: build through the shared template, apply
            --  the FINAL starting ratings (defaults ∪ submissions; V4/V5
            --  guarantee every stored action is keyed and defaulted actions
            --  carry exactly their DefaultActionPoints), then run the exact
            --  sibling-create canonical-write pipeline (SC-A1 gate, atomic
            --  write, baseline snapshot).
            declare
               E         : JSON_Value := New_Character (Stem, Playbook);
               --  Re-derived from the request body: the validation block's
               --  locals are out of scope here; V4/V5 already proved
               --  completeness and default matching.
               R         : constant JSON_Value := Get (B, "actionRatings");
               Out_Attrs : JSON_Array := Empty_Array;
               Old_Attrs : constant JSON_Array :=
                 Get (Get (E, "talent"), "attributes");
            begin
               for I in 1 .. Length (Old_Attrs) loop
                  declare
                     A0       : constant JSON_Value := Get (Old_Attrs, I);
                     Old_Acts : constant JSON_Array := Get (A0, "actions");
                     New_Acts : JSON_Array := Empty_Array;
                     A        : JSON_Value := Create_Object;
                  begin
                     for J in 1 .. Length (Old_Acts) loop
                        declare
                           X : JSON_Value := Create_Object;
                        begin
                           Set_Field (X, "name",
                             Str_Field (Get (Old_Acts, J), "name"));
                           Set_Field (X, "rating",
                             (if Has_Field (R, Str_Field (Get (Old_Acts, J), "name"))
                              then Integer'(Get (R, Str_Field (Get (Old_Acts, J), "name")))
                              else Default_Points_For
                                     (Str_Field (Get (Old_Acts, J), "name"))));
                           Set_Field (X, "maxRating",
                             Int_Field (Get (Old_Acts, J), "maxRating"));
                           Append (New_Acts, X);
                        end;
                     end loop;
                     Set_Field (A, "name", Str_Field (A0, "name"));
                     Set_Field (A, "experience", Clone (Get (A0, "experience")));
                     Set_Field (A, "actions", New_Acts);
                     Append (Out_Attrs, A);
                  end;
               end loop;
               Set_Field (Get (E, "talent"), "attributes", Out_Attrs);

               declare
                  Created_Ok : Boolean;
               begin
                  Schema_Check ("character", E, Created_Ok);
                  if not Created_Ok then
                     return Fail (AWS.Messages.S500, Op, "INTERNAL",
                                  Message =>
                                    "created entity fails schema validation");
                  end if;
               end;
               Write_Entity ("character", Str_Field (E, "id"), E);
               Write_Baseline_Snapshot ("character", Str_Field (E, "id"), Op, E);
               return Json_Response (Success_Result (Op, E));
            end;
         end;
      end;
   end Handle_Pc_Create;

   ---------------------------------------------------------------------------

   --  SC-A1 canonicalizer: the implementation lives in Pitd_Normalize; the
   --  public entry point stays on this package's spec for callers.
   function Canonicalize
     (Kind, Id : String; V : JSON_Value) return JSON_Value is
   begin
      return Pitd_Normalize.Canonicalize (Kind, Id, V);
   end Canonicalize;

   function Canonicalize
     (Kind, Id : String; Bytes : String) return JSON_Value is
   begin
      return Pitd_Normalize.Canonicalize (Kind, Id, Bytes);
   end Canonicalize;




   function Handle_Games (Path : String) return AWS.Response.Data is
      P2 : constant String := Part(Path,3); P3 : constant String := Part(Path,4); P4 : constant String := Part(Path,5);
      G : JSON_Value;
   begin
      if P2 = "" then
         G:=Read(Read_File(To_String(Games_Root)&"/games.json"));
         declare A:constant JSON_Array:=Get(G);O:JSON_Array:=Empty_Array;begin for I in 1..Length(A) loop declare X:JSON_Value:=Create_Object;V:constant JSON_Value:=Get(A,I);begin Set_Field(X,"name",Str_Field(V,"Name"));Set_Field(X,"stem",Str_Field(V,"Stem"));Set_Field(X,"language",Str_Field(V,"Language"));Append(O,X);end;end loop;return Json_Response(Create(O));end;
      end if;
      G:=Game(P2);if G.Kind/=JSON_Object_Type then return Fail(AWS.Messages.S404,"games.get","NOT_FOUND");end if;
      if P3="" then return Json_Response(G);
      elsif P3="playbooks" then
         declare A:constant JSON_Array:=Get(G,"Playbooks");begin if P4="" then return Json_Response(Create(A));end if;for I in 1..Length(A) loop if Str_Field(Get(A,I),"Name")=P4 then return Json_Response(Get(A,I));end if;end loop;return Fail(AWS.Messages.S404,"games.playbook","NOT_FOUND");end;
      elsif P3="heritages" then return Json_Response(Get(G,"Heritages"));
      elsif P3="crews" then
         declare N:constant String:=To_String(Games_Root)&"/"&P2&"-crews.json";V:JSON_Value;begin if not Ada.Directories.Exists(N) then return Fail(AWS.Messages.S404,"games.crews","NOT_FOUND");end if;V:=Read(Read_File(N));if P4="" then return Json_Response(V);end if;
            --  BUG-007: a known crew type returns its settings (200), not 404.
            if Has_Field (V, "CrewTypes") then
               declare A:constant JSON_Array:=Get(V,"CrewTypes");begin
                  for I in 1..Length(A) loop
                     if Str_Field(Get(A,I),"Name")=P4 then return Json_Response(Get(A,I));end if;
                  end loop;
               end;
            end if;
            return Fail(AWS.Messages.S404,"games.crew","NOT_FOUND");end;
      end if;
      return Fail(AWS.Messages.S404,"games.get","NOT_FOUND");
   end Handle_Games;




   function Handle_Entity (Request : AWS.Status.Data; Path : String) return AWS.Response.Data is
      Plural : constant String := Part (Path, 2);
      Kind   : constant String :=
        (if Plural = "characters" then "character"
         elsif Plural = "crews" then "crew" else "clock");
      Id     : constant String := Part (Path, 3);
      Suffix : constant String :=
        Part (Path, 4) & (if Part (Path, 5) /= "" then "/" & Part (Path, 5) else "");
      Is_Post : constant Boolean := AWS.Status.Method (Request) = AWS.Status.POST;
      B, E, R, Ctx : JSON_Value;
      Lock_Held : Boolean := False;
      Entity_Exists, Entity_Parse_Ok : Boolean := False;
      Adm_Issues : JSON_Array := Empty_Array;
      Adm_Canonical : Boolean := False;
   begin
      if Id = "" then
         if not Is_Post then
            --  BUG-012: collection GETs return declared summaries.
            --  SC-A4: total collections — every route is listed, degraded
            --  members included, so one unreadable member never removes
            --  valid rows and never changes the 200 status.
            if Kind = "character" then
               return Json_Response (Create (Character_Rows));
            elsif Kind = "crew" then
               return Json_Response (Create (Crew_Rows (Character_Rows)));
            end if;
            return Json_Response (Create (Clock_Rows));
         end if;
         B := Parse_Body (To_String (AWS.Status.Binary_Data (Request)));
         declare
            Create_Op : constant String :=
              (if Kind = "character" then "character.create"
               elsif Kind = "crew" then "crew.create" else "clock.create");
            Bad : Unbounded_String;
            Valid : Boolean;
         begin
            Valid := False;
            Valid := Validate_Request (Kind, Create_Op, B, Bad);
            if not Valid then
               return Fail (AWS.Messages.S400, Create_Op, "VALIDATION",
                            Message => To_String (Bad));
            end if;
         end;
         if Kind = "clock" then
            --  SC-A7: ownership and relationship references need store
            --  access, so they are validated here (CLOCK-OWNER-002,
            --  CLOCK-RELATED-009); the size bound keeps every stored clock
            --  usable by the proven core primitive.
            declare
               Bad : Unbounded_String;
            begin
               if not Check_Clock_Refs (B, "", Bad) then
                  return Fail (AWS.Messages.S400, "clock.create", "VALIDATION",
                               Message => To_String (Bad));
               end if;
               if Int_Field (B, "size") > Paperclips_Core.Capacity'Last then
                  return Fail (AWS.Messages.S400, "clock.create", "VALIDATION",
                               Message => "size exceeds the supported bound");
               end if;
            end;
         end if;
         if Kind = "character" then
            if Game (Str_Field (B, "gameStem")).Kind /= JSON_Object_Type then
               --  SC-A3: GAME_NOT_FOUND is a 200-status domain failure
               --  (locked status table), not a request-shape error.
               return Json_Response
                 (Game_Not_Found_Error
                    ("character.create",
                     "unknown game stem: " & Str_Field (B, "gameStem")));
            end if;
            E := New_Character (Str_Field (B, "gameStem"), Str_Field (B, "playbook"));
         elsif Kind = "crew" then
            if Game (Str_Field (B, "gameStem")).Kind /= JSON_Object_Type then
               return Json_Response
                 (Game_Not_Found_Error
                    ("crew.create",
                     "unknown game stem: " & Str_Field (B, "gameStem")));
            end if;
            E := New_Crew (Str_Field (B, "gameStem"), Str_Field (B, "crewType"));
         else
            E := New_Clock (B);
         end if;
         --  SC-A1: create is canonical by construction — the constructed
         --  entity must validate against the generated schema validator
         --  before the first write (fail closed; a template bug must never
         --  persist a non-canonical document).
         declare
            Created_Ok : Boolean;
         begin
            Schema_Check (Kind, E, Created_Ok);
            if not Created_Ok then
               return Fail (AWS.Messages.S500, Kind & ".create", "INTERNAL",
                            Message => "created entity fails schema validation");
            end if;
         end;
Write_Entity (Kind, Str_Field (E, "id"), E);
         --  SC-A8 / FV-028: create takes exactly one baseline snapshot so a
         --  fresh entity's first undo is not NO_HISTORY.  The baseline is
         --  excluded from the history listing and the derived projections
         --  (LIFECYCLE-DERIVED-001: fresh entity -> canUndo false,
         --  historyCount 0).
         if Kind = "character" or else Kind = "crew" then
            Write_Baseline_Snapshot (Kind, Str_Field (E, "id"), Kind & ".create", E);
         end if;
         return Json_Response (Success_Result (Kind & ".create", E));
      end if;
      if not Safe (Id) then return Fail (AWS.Messages.S404, "get", "NOT_FOUND"); end if;
      --  BUG-001: every mutation of an existing entity claims that entity's
      --  lock BEFORE the read, and holds it across read+mutate+snapshot+
      --  write.  The lock is released on every exit path and on exception.
      --  Different entities claim different slots and run in parallel; the
      --  same entity is serialized via a short bounded spin on the registry.
      if Is_Post then
         loop
            Entity_Lock_Registry.Claim (Id, 0, Lock_Held);
            exit when Lock_Held;
            delay 0.001;
         end loop;
      end if;
      --  SC-A3: ONE read/parse/admission path — direct GET, history reads,
      --  mutations, capabilities, and (via Roster_Value) collection
      --  projection all classify the stored bytes through Classify_Stored.
      --  Purely read-only: admission never writes and never repairs.
      if Ada.Directories.Exists (Current_File (Kind, Id)) then
         Entity_Exists := True;
         Classify_Stored (Kind, Id, Read_File (Current_File (Kind, Id)),
                          E, Ctx, Adm_Issues, Adm_Canonical);
      else
         E := JSON_Null;
      end if;
      if not Entity_Exists then
         if Lock_Held then Entity_Lock_Registry.Release (Id); end if;
         return Fail (AWS.Messages.S404, (if Suffix = "" then "get" else Suffix),
                      "NOT_FOUND", Message => "entity not found");
      end if;
      --  direct-access admission: a parseable non-canonical stored entity
      --  (repairable / needs-input) or unparseable bytes fail every direct
      --  route with 422 INVALID_ENTITY + repairability details; collections
      --  stay 200 (Roster_Value classifies rows without failing).  Import/
      --  repair/repair-preview are the recovery paths themselves; delete is
      --  exempt so the token-gated degraded deletion flow (SC-A4) can land
      --  — the raw-byte content token (If-Match) gates it below, never the
      --  entity revision.
      if not Adm_Canonical then
         if Suffix = "import" or else Suffix = "repair"
           or else Suffix = "repair-preview"
           or else Suffix = "delete"
         then
            null;
         else
            if Lock_Held then Entity_Lock_Registry.Release (Id); end if;
            return Json_Response
              (Invalid_Entity_Result (Suffix, Adm_Issues), AWS.Messages.S422);
         end if;
      end if;
      if Suffix = "" then
         declare
            X : AWS.Response.Data := Json_Text (Read_File (Current_File (Kind, Id)));
         begin
            if AWS.Status.Parameter (Request, "download") = "1" then
               AWS.Response.Set.Add_Header
                 (X, "Content-Disposition", "attachment; filename=""" & Id & ".json""");
            end if;
            if Lock_Held then Entity_Lock_Registry.Release (Id); end if;
            return X;
         end;
      end if;
      if Suffix = "history" then
         declare
            X : constant AWS.Response.Data := Json_Response (Create (History (Kind, Id)));
         begin
            if Lock_Held then Entity_Lock_Registry.Release (Id); end if;
            return X;
         end;
      end if;
      --  BUG-007: GET /characters/{id}/history/{snapshotId} (and crew) return
      --  the stored snapshot entity (declared 200 route).
      if Suffix'Length > 8 and then
        Suffix (Suffix'First .. Suffix'First + 7) = "history/"
      then
         declare
            Sid   : constant String := Suffix (Suffix'First + 8 .. Suffix'Last);
            FName : constant String := Entity_Dir (Kind, Id) & "/history/" & Sid & ".json";
         begin
            if Lock_Held then Entity_Lock_Registry.Release (Id); end if;
            if not Ada.Directories.Exists (FName) then
               return Fail (AWS.Messages.S404, "history.get", "NOT_FOUND");
            end if;
            declare V : constant JSON_Value := Read (Read_File (FName)); begin
               if Has_Field (V, "entity") then
                  return Json_Response (Get (V, "entity"));
               end if;
            end;
            return Fail (AWS.Messages.S404, "history.get", "NOT_FOUND");
         end;
      end if;
      --  SC-A5: advisory capability projections (GET only, read-only).
      --  No lock is held on GET paths and nothing is written, so entity
      --  bytes are identical before and after a capability read.
      if Suffix = "capabilities" then
         declare
            X : JSON_Value;
         begin
            if Kind = "character" then
               X := Character_Capabilities (E);
            elsif Kind = "crew" then
               X := Crew_Capabilities (E);
            else
               X := JSON_Null;
            end if;
            if Lock_Held then Entity_Lock_Registry.Release (Id); end if;
            if X.Kind /= JSON_Object_Type then
               return Fail (AWS.Messages.S422, "capabilities.get",
                            "INVALID_ENTITY", E,
                            "entity game settings cannot be resolved");
            end if;
            return Json_Response (X);
         end;
      end if;
      if not Is_Post then return Fail (AWS.Messages.S404, "request", "NOT_FOUND"); end if;
      --  SC-A3: write-path admission happened above through the shared
      --  Classify_Stored path — every mutation on a degraded entity already
      --  returned 422 INVALID_ENTITY with pointer-level details and no
      --  write; delete and the import/repair recovery paths are exempt.
      B := Parse_Body (To_String (AWS.Status.Binary_Data (Request)));
      declare
         Scope_Key : Unbounded_String := Null_Unbounded_String;
         Body_Hash : Unbounded_String := Null_Unbounded_String;
      begin
--  BUG-002: idempotency is scoped to method+route+entityId+key and
         --  compared against the hashed raw body.  An exact retry replays the
         --  stored response; the same scope key with a different body hash is
         --  rejected as 409 VALIDATION (ok:false) with no write.
         --  SC-A6: the documented request bound (openapi maxLength 128) is
         --  enforced here — an over-long key is a 400 VALIDATION, never used.
         if Header (Request, "Idempotency-Key") /= "" then
            if Header (Request, "Idempotency-Key")'Length > 128 then
               Entity_Lock_Registry.Release (Id);
               return Fail (AWS.Messages.S400, Suffix, "VALIDATION", E,
                            "Idempotency-Key exceeds the 128-character maximum");
            end if;
            declare
               Scope : constant String :=
                 AWS.Status.Method (Request) & "|" & Path & "|"
                 & Header (Request, "Idempotency-Key");
               Hash  : constant String :=
                 GNAT.SHA256.Digest (To_String (AWS.Status.Binary_Data (Request)));
               Found, Match : Boolean;
               Stored : Unbounded_String;
            begin
               Idempotency_Store.Lookup (Scope, Hash, Found, Match, Stored);
               if Found then
                  Entity_Lock_Registry.Release (Id);
                  if Match then
                     return Json_Text (To_String (Stored));
                  else
                     return Fail (AWS.Messages.S409, Suffix, "VALIDATION", E,
                                  "idempotency key already used with a different body");
                  end if;
               end if;
               Scope_Key := To_Unbounded_String (Scope);
               Body_Hash := To_Unbounded_String (Hash);
            end;
         end if;
         --  SC-A3: CONC-IFMATCH-001/002/003 — undo, delete, and retire
         --  require If-Match (missing required header → 400 VALIDATION,
         --  nothing written); import/repair apply enforce the same rule in
         --  their own handlers.
         if (Suffix = "undo" or else Suffix = "delete" or else Suffix = "retire")
           and then Header (Request, "If-Match") = ""
         then
            Entity_Lock_Registry.Release (Id);
            return Json_Response
              (Validation_Error (Suffix, Suffix & " requires If-Match",
                                 Root_Issues (Suffix & " requires If-Match"), E),
               AWS.Messages.S400);
         end if;
         --  SC-A3: stale revision → typed STALE_REVISION carrying the
         --  current revision in details (CONC-REV-004).  SC-A4: a degraded
         --  entity's concurrency anchor is the sha256: content token of the
         --  CURRENT raw bytes (the collection row's deleteToken) — a token
         --  that no longer matches the bytes → 409 STALE_REVISION with the
         --  current token in details (never act on unseen data).  Import/
         --  repair validate If-Match inside their own handlers (entity
         --  revision OR sha256: content token for degraded targets;
         --  required on apply, optional on preview).
         if Suffix /= "import" and then Suffix /= "repair"
           and then Suffix /= "repair-preview"
           and then Header (Request, "If-Match") /= ""
         then
            if Adm_Canonical then
               if Header (Request, "If-Match") /=
                 Trim_Image (Int_Field (E, "revision"))
               then
                  Entity_Lock_Registry.Release (Id);
                  return Json_Response
                    (Stale_Result (Suffix, E, Int_Field (E, "revision")),
                     AWS.Messages.S409);
               end if;
            else
               declare
                  Cur_Token : constant String :=
                    Content_Token (Read_File (Current_File (Kind, Id)));
               begin
                  if Header (Request, "If-Match") /= Cur_Token then
                     Entity_Lock_Registry.Release (Id);
                     return Json_Response
                       (Stale_Result (Suffix, E, -1, Cur_Token),
                        AWS.Messages.S409);
                  end if;
               end;
            end if;
         end if;
         if Suffix = "delete" then
            if not Bool_Field (B, "confirm") then
               Entity_Lock_Registry.Release (Id);
               return Json_Response
                 (Confirm_Required_Result ("delete", E));
            end if;
if Kind = "crew" then
               --  SC-A4 Q16: deleting a crew scans READABLE characters and
               --  atomically clears every matching dossier.crewId before
               --  removing the crew; unreadable characters never block the
               --  deletion and remain separately visible (their bytes are
               --  never touched).
               declare
                  A : constant JSON_Array := Entity_Ids ("character");
               begin
                  for I in 1 .. Length (A) loop
                     declare
                        Cid : constant String := Get (Get (A, I));
                        V   : JSON_Value;
                        Exists, Parse_Ok : Boolean;
                     begin
                        Try_Read_Entity ("character", Cid, V, Exists, Parse_Ok);
                        if V.Kind = JSON_Object_Type
                          and then Entity_Is_Canonical ("character", Cid, V)
                          and then Str_Field (Get (V, "dossier"), "crewId") = Id
                        then
                           Set_Field (Get (V, "dossier"), "crewId", "");
                           Stamp (V);
                           Write_Entity ("character", Cid, V);
                        end if;
                     end;
                  end loop;
               end;
            end if;
            declare
               Sides : JSON_Array := Empty_Array;
            begin
               if Kind = "clock" then
                  --  W4 unlink-on-delete: this clock's id is removed from
                  --  every remaining clock's relatedClockIds in the same
                  --  atomic snapshot (clock-taxonomy.mdx §9); related
                  --  clocks are never deleted, only unlinked.
                  declare
                     A : constant JSON_Array := Entity_Ids ("clock");
                  begin
                     for I in 1 .. Length (A) loop
                        declare
                           Cid : constant String := Get (Get (A, I));
                           V   : JSON_Value;
                           Exists, Parse_Ok : Boolean;
                        begin
                           if Cid /= Id then
                              Try_Read_Entity ("clock", Cid, V, Exists, Parse_Ok);
                              if V.Kind = JSON_Object_Type
                                and then Entity_Is_Canonical ("clock", Cid, V)
                                and then Has_Field (V, "relatedClockIds")
                              then
                                 declare
                                    Old : constant JSON_Array :=
                                      Get (V, "relatedClockIds");
                                    O   : JSON_Array := Empty_Array;
                                    Changed : Boolean := False;
                                 begin
                                    for J in 1 .. Length (Old) loop
                                       if String'(Get (Get (Old, J))) = Id then
                                          Changed := True;
                                       else
                                          Append (O, Get (Old, J));
                                       end if;
                                    end loop;
                                    if Changed then
                                       Set_Field (V, "relatedClockIds", O);
                                       Stamp (V);
                                       Write_Entity ("clock", Cid, V);
                                    end if;
                                 end;
                              end if;
                           end if;
                        end;
                     end loop;
                  end;
               elsif Kind = "character" or else Kind = "crew" then
                  --  W5 owner deletion: standalone clocks owned by this
                  --  entity are reassigned to campaign ownership in the
                  --  same snapshot (clock-taxonomy.mdx §8); no clock is
                  --  deleted.  The delete result reports each reassignment
                  --  as a sideEffect (frozen C2 contract).
                  declare
                     A : constant JSON_Array := Entity_Ids ("clock");
                  begin
                     for I in 1 .. Length (A) loop
                        declare
                           Cid : constant String := Get (Get (A, I));
                           V   : JSON_Value;
                           Exists, Parse_Ok : Boolean;
                        begin
                           Try_Read_Entity ("clock", Cid, V, Exists, Parse_Ok);
                           if V.Kind = JSON_Object_Type
                             and then Entity_Is_Canonical ("clock", Cid, V)
                             and then Str_Field (V, "ownerKind") = Kind
                             and then Str_Field (V, "ownerId") = Id
                           then
                              Set_Field (V, "ownerKind", "campaign");
                              Set_Field (V, "ownerId", "");
                              Stamp (V);
                              Write_Entity ("clock", Cid, V);
                              Append (Sides, Create
                                        ("clock " & Cid & " reassigned to campaign"));
                           end if;
                        end;
                     end loop;
                  end;
               end if;
               Ada.Directories.Delete_Tree (Entity_Dir (Kind, Id));
               Entity_Lock_Registry.Release (Id);
               --  SC-A4: a degraded entity has no readable DTO to embed in
               --  the success envelope; the delete result carries the
               --  ok/applied/sideEffects envelope only.
               declare
                  R  : JSON_Value := Create_Object;
                  A2 : JSON_Value := Create_Object;
               begin
                  Set_Field (A2, "op", "delete");
                  Set_Field (R, "ok", True);
                  Set_Field (R, "applied", A2);
                  Set_Field (R, "sideEffects", Sides);
                  Set_Field (R, "error", JSON_Null);
                  if Adm_Canonical then Set_Field (R, Kind, E); end if;
                  return Json_Response (R);
               end;
            end;
         end if;
         if Suffix = "undo" then
            declare
               Base   : constant String := Entity_Dir (Kind, Id) & "/history";
               Search : Ada.Directories.Search_Type;
               Ent    : Ada.Directories.Directory_Entry_Type;
               Best   : Unbounded_String := Null_Unbounded_String;
            begin
               if Ada.Directories.Exists (Base) then
                  Ada.Directories.Start_Search
                    (Search, Base, "*.json",
                     (Ada.Directories.Ordinary_File => True, others => False));
                  while Ada.Directories.More_Entries (Search) loop
                     Ada.Directories.Get_Next_Entry (Search, Ent);
--  BUG-008: undo picks the MAXIMUM (newest) snapshot
                     --  deterministically; the monotonic 17-digit filename
                     --  prefix makes lexicographic order equal creation order.
                     --  The create baseline is excluded from the search and
                     --  used only as the fallback below (FV-028).
                     if Ada.Directories.Simple_Name (Ent) /= "_index.json"
                       and then not Is_Baseline_Snapshot (Ada.Directories.Simple_Name (Ent))
                       and then (Length (Best) = 0
                         or else Ada.Directories.Simple_Name (Ent) > To_String (Best))
                     then
                        Best := To_Unbounded_String (Ada.Directories.Simple_Name (Ent));
                     end if;
                  end loop;
                  Ada.Directories.End_Search (Search);
               end if;
               if Length (Best) = 0
                 and then Ada.Directories.Exists (Base & "/" & Baseline_Snapshot_Name)
               then
                  --  FV-028: a fresh entity's first undo restores the create
                  --  baseline instead of failing with NO_HISTORY.
                  Best := To_Unbounded_String (Baseline_Snapshot_Name);
               end if;
               if Length (Best) = 0 then
                  Entity_Lock_Registry.Release (Id);
                  return Json_Response (No_History_Error ("undo", "no history", E));
               end if;
               declare
                  Path     : constant String := Base & "/" & To_String (Best);
                  V        : constant JSON_Value := Read (Read_File (Path));
                  Restored : constant JSON_Value := Get (V, "entity");
               begin
                  Set_Field (Restored, "revision", Int_Field (E, "revision") + 1);
                  Set_Field (Restored, "updatedAt", Now);
                  Write_Entity (Kind, Id, Restored);
                  Ada.Directories.Delete_File (Path);
                  --  OPT-002: keep the sidecar consistent after undo consumes
                  --  the newest snapshot.
                  Rebuild_Index (Kind, Id);
                  Entity_Lock_Registry.Release (Id);
                  return Json_Response (Success_Result ("undo", Restored));
               end;
            end;
         end if;
         if Suffix = "import" then
            --  SC-A2: import preview/apply transaction.  Preview
            --  (?preview=1) classifies the submitted document WITHOUT
            --  writing: canonical → 200 PreviewResult with a preview token;
            --  changes needed (fills, conversions, clamps, legacy
            --  conversions, displayed removals, needs-input) → 409
            --  NORMALIZATION_REQUIRED with warnings, the previewed
            --  document, and the token.  Apply requires If-Match (entity
            --  revision, or the sha256: content token for a degraded
            --  target), the preview token, and confirm:true; it atomically
            --  writes the previewed result, clears history, and takes
            --  exactly one baseline snapshot.
            declare
               Preview_Mode : constant Boolean :=
                 Has_Preview (AWS.URL.Query (AWS.Status.URI (Request)));
               Entity_V  : JSON_Value;
               Cur_Rev   : Integer := -1;
               Cur_Token : Unbounded_String := Null_Unbounded_String;
               Input_Hash : Unbounded_String := Null_Unbounded_String;
            begin
               if not Entity_Exists then
                  Entity_Lock_Registry.Release (Id);
                  return Fail (AWS.Messages.S404, "import", "NOT_FOUND",
                               Message => "entity not found");
               end if;
               if B.Kind /= JSON_Object_Type or else not Has_Field (B, "entity")
                 or else Get (B, "entity").Kind /= JSON_Object_Type
               then
                  Entity_Lock_Registry.Release (Id);
                  return Fail (AWS.Messages.S400, "import", "VALIDATION", E,
                               "import requires an entity object");
               end if;
               Entity_V := Get (B, "entity");
               if Preview_Mode then
                  if not Only_Fields (B, "|entity|") then
                     Entity_Lock_Registry.Release (Id);
                     return Fail (AWS.Messages.S400, "import", "VALIDATION", E,
                                  "preview mode takes {entity} only");
                  end if;
               else
                  if not Only_Fields (B, "|entity|previewToken|confirm|") then
                     Entity_Lock_Registry.Release (Id);
                     return Fail (AWS.Messages.S400, "import", "VALIDATION", E,
                                  "import apply takes {entity, previewToken, confirm:true}");
                  end if;
               end if;
               --  D8 inbound: a body of a wholly different entity type needs
               --  the caller's decision (repair or delete + re-import).
               if Has_Field (Entity_V, "kind")
                 and then Get (Entity_V, "kind").Kind = JSON_String_Type
                 and then Str_Field (Entity_V, "kind") /= Kind
               then
                  declare
                     Issues : JSON_Array := Empty_Array;
                  begin
                     Append (Issues, Issue_At
                               ("/kind",
                                "identity: body kind " & Str_Field (Entity_V, "kind")
                                & " does not match route " & Kind
                                & " (directory is authoritative)",
                                "kind " & Kind));
                     Entity_Lock_Registry.Release (Id);
                     return Json_Response
                       (Invalid_Entry_Result ("import", Issues), AWS.Messages.S400);
                  end;
               end if;
               --  the preview token binds the exact submitted bytes and the
               --  stored version at preview time
               Input_Hash := To_Unbounded_String
                 (GNAT.SHA256.Digest (Write (Entity_V, Compact => True)));
               if E.Kind = JSON_Object_Type then
                  Cur_Rev := Int_Field (E, "revision");
               else
                  Cur_Token := To_Unbounded_String
                    (Content_Token (Read_File (Current_File (Kind, Id))));
               end if;
               if Preview_Mode then
                  declare
                     Ctx     : JSON_Value := Canonicalize (Kind, Id, Entity_V);
                     Tok_S   : Unbounded_String := Null_Unbounded_String;
                     Needs   : JSON_Array;
                     Issues  : JSON_Array;
                     Changes : JSON_Array;
                     Warnings : JSON_Array;
                     Preview : JSON_Value;
                  begin
                     if Str_Field (Ctx, "outcome") = "unreadable" then
                        Entity_Lock_Registry.Release (Id);
                        return Fail (AWS.Messages.S400, "import", "VALIDATION", E,
                                     "entity must be a JSON object");
                     end if;
                     Resolve_Import_Needs (Kind, Id, E, Entity_V, Ctx);
                     Needs := Get (Ctx, "needsInputPointers");
                     Issues := Get (Ctx, "issues");
                     Changes := Get (Ctx, "changes");
                     Warnings := Get (Ctx, "warnings");
                     Preview_Issue
                       (Kind, Id, To_String (Input_Hash), Cur_Rev, To_String (Cur_Token),
                        Get (Ctx, "document"), Str_Field (Ctx, "outcome"),
                        Needs, Issues, Changes, Warnings, Tok_S);
                     Preview := Preview_Result_Value
                       (Changes, Warnings, Needs, False,
                        Get (Ctx, "document"), To_String (Tok_S));
                     Entity_Lock_Registry.Release (Id);
                     if Bool_Field (Ctx, "canonical") then
                        --  already canonical: 200 PreviewResult whose token
                        --  unlocks the confirming apply
                        return Json_Response (Preview);
                     end if;
                     return Json_Response
                       (Normalization_Required_Result
                          ("import", Preview, Warnings, Needs, To_String (Tok_S)),
                        AWS.Messages.S409);
                  end;
               else
                  --  apply mode: If-Match is apply-only and required
                  if Header (Request, "If-Match") = "" then
                     Entity_Lock_Registry.Release (Id);
                     return Fail (AWS.Messages.S400, "import", "VALIDATION", E,
                                  "import apply requires If-Match (entity revision or sha256: content token)");
                  end if;
                  if E.Kind = JSON_Object_Type then
                     if Header (Request, "If-Match") /= Trim_Image (Cur_Rev) then
                        Entity_Lock_Registry.Release (Id);
                        return Json_Response
                          (Stale_Result ("import", E, Cur_Rev), AWS.Messages.S409);
                     end if;
                  elsif Header (Request, "If-Match") /= To_String (Cur_Token) then
                     Entity_Lock_Registry.Release (Id);
                     return Json_Response
                       (Stale_Result ("import", E, -1, To_String (Cur_Token)), AWS.Messages.S409);
                  end if;
                  --  D6: unknown properties are rejected unless the preview
                  --  classified and displayed their removal — a tokenless
                  --  apply of an unclassified removal is INVALID_ENTRY.
                  if not Has_Field (B, "previewToken") then
                     declare
                        Ctx : constant JSON_Value := Canonicalize (Kind, Id, Entity_V);
                     begin
                        if Has_Change_Reason (Get (Ctx, "changes"), "unknown-key removal") then
                           Entity_Lock_Registry.Release (Id);
                           return Json_Response
                             (Invalid_Entry_Result
                                ("import", Issues_For_Reason (Get (Ctx, "changes"),
                                                              "unknown-key removal")),
                              AWS.Messages.S400);
                        end if;
                     end;
                  end if;
                  if not Has_Field (B, "previewToken")
                    or else Get (B, "previewToken").Kind /= JSON_String_Type
                    or else Str_Field (B, "previewToken") = ""
                  then
                     Entity_Lock_Registry.Release (Id);
                     return Fail (AWS.Messages.S400, "import", "VALIDATION", E,
                                  "import apply requires the previewToken issued by the preview");
                  end if;
                  if not Bool_Field (B, "confirm") then
                     Entity_Lock_Registry.Release (Id);
                     return Json_Response (Confirm_Required_Result ("import", E));
                  end if;
                  --  redeem the single-use token; every binding must hold
                  declare
                     Found, Used : Boolean;
                     Tok   : Preview_Token_Entry;
                     Doc   : JSON_Value;
                     New_Rev : Integer;
                  begin
                     Preview_Redeem
                       (Str_Field (B, "previewToken"), Found, Used, Tok);
                     if not Found or else Used
                       or else Tok.Expires < Ada.Calendar.Clock
                       or else To_String (Tok.Kind) /= Kind
                       or else To_String (Tok.Id) /= Id
                       or else To_String (Tok.Input_Hash) /= Input_Hash
                     then
                        Entity_Lock_Registry.Release (Id);
                        return Json_Response
                          (Stale_Result ("import", E, Cur_Rev, To_String (Cur_Token)),
                           AWS.Messages.S409);
                     end if;
                     --  the stored entity must be unchanged since preview
                     if (E.Kind = JSON_Object_Type and then Tok.Revision /= Cur_Rev)
                       or else (E.Kind /= JSON_Object_Type
                                and then To_String (Tok.Content) /= To_String (Cur_Token))
                     then
                        Entity_Lock_Registry.Release (Id);
                        return Json_Response
                          (Stale_Result ("import", E, Cur_Rev, To_String (Cur_Token)),
                           AWS.Messages.S409);
                     end if;
                     --  caller-only needs-input pointers without caller
                     --  values: INVALID_ENTRY with pointer-level details
                     if Length (Tok.Needs) > 0 then
                        Entity_Lock_Registry.Release (Id);
                        return Json_Response
                          (Invalid_Entry_Result ("import", Tok.Issues),
                           AWS.Messages.S400);
                     end if;
                     Doc := Clone (Tok.Doc);
                     --  settings-derived maxima gate (R4 gap #4): a
                     --  schema-valid document must never store trackers
                     --  above the game-settings bounds
                     declare
                        Max_Issues : constant JSON_Array :=
                          Settings_Maxima_Issues (Kind, Doc);
                     begin
                        if Length (Max_Issues) > 0 then
                           Entity_Lock_Registry.Release (Id);
                           return Json_Response
                             (Invalid_Entry_Result ("import", Max_Issues),
                              AWS.Messages.S400);
                        end if;
                     end;
                     --  atomic apply: clear history, take exactly ONE
                     --  baseline snapshot, then write current.json
                     if E.Kind = JSON_Object_Type then
                        New_Rev := Cur_Rev + 1;
                     else
                        New_Rev := Integer'Max (1, Int_Field (Doc, "revision"));
                     end if;
                     Set_Field (Doc, "revision", New_Rev);
                     Set_Field (Doc, "updatedAt", Now);
                     declare
                        Hist : constant String := Entity_Dir (Kind, Id) & "/history";
                     begin
                        if Ada.Directories.Exists (Hist) then
                           Ada.Directories.Delete_Tree (Hist);
                        end if;
                        Ada.Directories.Create_Path (Hist);
                     end;
                     Snapshot (Kind, Id, "import", Doc);
                     Write_Entity (Kind, Id, Doc);
                     Entity_Lock_Registry.Release (Id);
                     return Json_Response (Success_Result ("import", Doc));
                  end;
               end if;
            end;
         end if;
         if Suffix = "repair-preview" then
            --  SC-A2: repair preview computes the normalized result of the
            --  STORED entity WITHOUT writing.  Canonical stored entity →
            --  200 PreviewResult (no token — nothing to confirm).  Repairable
            --  / needs-input → 409 NORMALIZATION_REQUIRED with warnings, the
            --  previewed result, and the preview token.  Unparseable bytes →
            --  422 INVALID_ENTITY (deletion only).  Optional body:
            --  caller-supplied values for needs-input pointers, keyed by
            --  JSON pointer; keys that do not resolve are ignored with a
            --  warning.
            declare
               Cur_Token : Unbounded_String := Null_Unbounded_String;
            begin
               if not Entity_Exists then
                  Entity_Lock_Registry.Release (Id);
                  return Fail (AWS.Messages.S404, "repair-preview", "NOT_FOUND",
                               Message => "entity not found");
               end if;
               if E.Kind /= JSON_Object_Type then
                  --  D10/D9: unreadable — no normalization is possible
                  declare
                     Issues : JSON_Array := Empty_Array;
                  begin
                     Append (Issues, Issue_At
                               ("", "bytes cannot be parsed as JSON; unreadable — cannot be normalized",
                                "a parseable entity object"));
                     Entity_Lock_Registry.Release (Id);
                     return Json_Response
                       (Invalid_Entity_Result ("repair-preview", Issues),
                        AWS.Messages.S422);
                  end;
               end if;
               Cur_Token := To_Unbounded_String
                 (Content_Token (Read_File (Current_File (Kind, Id))));
               --  If-Match is optional on preview; when present it must
               --  match the current revision or content token
               if Header (Request, "If-Match") /= "" then
                  if Header (Request, "If-Match")'Length > 7
                    and then Header (Request, "If-Match")
                      (Header (Request, "If-Match")'First
                       .. Header (Request, "If-Match")'First + 6) = "sha256:"
                  then
                     if Header (Request, "If-Match") /= To_String (Cur_Token) then
                        Entity_Lock_Registry.Release (Id);
                        return Json_Response
                          (Stale_Result ("repair-preview", E, -1, To_String (Cur_Token)),
                           AWS.Messages.S409);
                     end if;
                  elsif Header (Request, "If-Match") /=
                    Trim_Image (Int_Field (E, "revision"))
                  then
                     Entity_Lock_Registry.Release (Id);
                     return Json_Response
                       (Stale_Result ("repair-preview", E,
                                      Int_Field (E, "revision")),
                        AWS.Messages.S409);
                  end if;
               end if;
               declare
                  Ctx     : JSON_Value := Canonicalize
                    (Kind, Id, Read_File (Current_File (Kind, Id)));
                  Tok_S   : Unbounded_String := Null_Unbounded_String;
                  Needs   : JSON_Array;
                  Issues  : JSON_Array;
                  Changes : JSON_Array;
                  Warnings : JSON_Array;
                  Preview : JSON_Value;
               begin
                  if Str_Field (Ctx, "outcome") = "unreadable" then
                     declare
                        Iss : JSON_Array := Empty_Array;
                     begin
                        Append (Iss, Issue_At
                                  ("", "bytes cannot be parsed as JSON; unreadable — cannot be normalized",
                                   "a parseable entity object"));
                        Entity_Lock_Registry.Release (Id);
                        return Json_Response
                          (Invalid_Entity_Result ("repair-preview", Iss),
                           AWS.Messages.S422);
                     end;
                  end if;
                  --  caller-supplied values for needs-input pointers
                  if B.Kind = JSON_Object_Type and then
                    Length (JSON_Array'(Get (Ctx, "needsInputPointers"))) > 0
                  then
                     declare
                        Needs_A : constant JSON_Array :=
                          Get (Ctx, "needsInputPointers");
                        Remaining : JSON_Array := Empty_Array;
                        Iss      : JSON_Array := Empty_Array;
                        Ch       : JSON_Array := Get (Ctx, "changes");
                        Wn       : JSON_Array := Get (Ctx, "warnings");
                        Doc      : constant JSON_Value := Get (Ctx, "document");
                        K : constant JSON_Array := Collect_Keys (B);
                     begin
                        for I in 1 .. Length (Needs_A) loop
                           declare
                              Ptr    : constant String := Get (Get (Needs_A, I));
                              Set_Ok : Boolean := False;
                           begin
                              if Has_Field (B, Ptr) then
                                 Set_Ok := Set_At_Pointer (Doc, Ptr, Get (B, Ptr));
                              end if;
                              if Set_Ok then
                                 declare
                                    X : JSON_Value := Create_Object;
                                 begin
                                    Set_Field (X, "pointer", Ptr);
                                    Set_Field (X, "reason", "caller-supplied value");
                                    Set_Field (X, "previous", JSON_Null);
                                    Set_Field (X, "replacement", Clone (Get (B, Ptr)));
                                    Append (Ch, X);
                                 end;
                                 Append (Wn, Create
                                           ("Caller-supplied value provided for " & Ptr));
                              else
                                 Append (Remaining, Create (Ptr));
                              end if;
                           end;
                        end loop;
                        for I in 1 .. Length (JSON_Array'(Get (Ctx, "issues"))) loop
                           declare
                              X    : constant JSON_Value := Get (Get (Ctx, "issues"), I);
                              Keep : Boolean := False;
                           begin
                              for J in 1 .. Length (Remaining) loop
                                 declare
                  R_Ptr : constant String := Get (Get (Remaining, J));
               begin
                  if R_Ptr = Str_Field (X, "pointer") then
                     Keep := True;
                     exit;
                  end if;
               end;
                              end loop;
                              if Keep then Append (Iss, X); end if;
                           end;
                        end loop;
                        --  keys that do not resolve to a needs-input pointer
                        --  are ignored with a warning
                        for J in 1 .. Length (K) loop
                           declare
                              Key_Name : constant String := Get (Get (K, J));
                              Is_Needs : Boolean := False;
                           begin
                              for I in 1 .. Length (Needs_A) loop
                                 declare
                                    N_Ptr : constant String := Get (Get (Needs_A, I));
                                 begin
                                    if Key_Name = N_Ptr then
                                       Is_Needs := True;
                                       exit;
                                    end if;
                                 end;
                              end loop;
                              if not Is_Needs then
                                 Append (Wn, Create
                                           ("Ignored repair-preview value: " & Key_Name
                                            & " does not resolve to a needs-input pointer"));
                              end if;
                           end;
                        end loop;
                        Set_Field (Ctx, "needsInputPointers", Remaining);
                        Set_Field (Ctx, "issues", Iss);
                        Set_Field (Ctx, "changes", Ch);
                        Set_Field (Ctx, "warnings", Wn);
                        Set_Field (Ctx, "outcome",
                                   (if Length (Remaining) > 0 then "needs-input"
                                    elsif Length (Ch) > 0 then "repairable"
                                    else "canonical"));
                        Set_Field (Ctx, "canonical",
                                   Length (Remaining) = 0
                                   and then Length (Ch) = 0);
                     end;
                  end if;
                  Needs := Get (Ctx, "needsInputPointers");
                  Issues := Get (Ctx, "issues");
                  Changes := Get (Ctx, "changes");
                  Warnings := Get (Ctx, "warnings");
                  if Bool_Field (Ctx, "canonical") then
                     --  already canonical: nothing to confirm, no token
                     Entity_Lock_Registry.Release (Id);
                     return Json_Response
                       (Preview_Result_Value
                          (Changes, Warnings, Needs, True,
                           Get (Ctx, "document")));
                  end if;
                  --  repairable / needs-input: token + 409
                  Preview_Issue
                    (Kind, Id, To_String (Cur_Token), Int_Field (E, "revision"),
                     To_String (Cur_Token),
                     Get (Ctx, "document"), Str_Field (Ctx, "outcome"),
                     Needs, Issues, Changes, Warnings, Tok_S);
                  Preview := Preview_Result_Value
                    (Changes, Warnings, Needs, False,
                     Get (Ctx, "document"), To_String (Tok_S));
                  Entity_Lock_Registry.Release (Id);
                  return Json_Response
                    (Normalization_Required_Result
                       ("repair-preview", Preview, Warnings, Needs, To_String (Tok_S)),
                     AWS.Messages.S409);
               end;
            end;
         end if;
         if Suffix = "repair" then
            --  SC-A2: confirmed repair apply.  Requires If-Match (entity
            --  revision, or the sha256: content token for degraded rows),
            --  the repair-preview token, and confirm:true.  Changed stored
            --  bytes since the preview → 409 STALE_REVISION; no valid token
            --  → 409 NORMALIZATION_REQUIRED (preview first).  Atomically
            --  writes the previewed result — one snapshot, revision +1.
            declare
               Cur_Token : Unbounded_String := Null_Unbounded_String;
            begin
               if not Entity_Exists then
                  Entity_Lock_Registry.Release (Id);
                  return Fail (AWS.Messages.S404, "repair", "NOT_FOUND",
                               Message => "entity not found");
               end if;
               if E.Kind /= JSON_Object_Type then
                  --  unparseable stored bytes: no repair (deletion only)
                  declare
                     Issues : JSON_Array := Empty_Array;
                  begin
                     Append (Issues, Issue_At
                               ("", "bytes cannot be parsed as JSON; unreadable — cannot be normalized",
                                "a parseable entity object"));
                     Entity_Lock_Registry.Release (Id);
                     return Json_Response
                       (Invalid_Entity_Result ("repair", Issues),
                        AWS.Messages.S422);
                  end;
               end if;
               Cur_Token := To_Unbounded_String
                 (Content_Token (Read_File (Current_File (Kind, Id))));
               --  If-Match is required (revision or content token)
               if Header (Request, "If-Match") = "" then
                  Entity_Lock_Registry.Release (Id);
                  return Fail (AWS.Messages.S400, "repair", "VALIDATION", E,
                               "repair apply requires If-Match (entity revision or sha256: content token)");
               end if;
               if Header (Request, "If-Match")'Length > 7
                 and then Header (Request, "If-Match")
                   (Header (Request, "If-Match")'First
                    .. Header (Request, "If-Match")'First + 6) = "sha256:"
               then
                  if Header (Request, "If-Match") /= To_String (Cur_Token) then
                     Entity_Lock_Registry.Release (Id);
                     return Json_Response
                       (Stale_Result ("repair", E, -1, To_String (Cur_Token)),
                        AWS.Messages.S409);
                  end if;
               elsif Header (Request, "If-Match") /=
                 Trim_Image (Int_Field (E, "revision"))
               then
                  Entity_Lock_Registry.Release (Id);
                  return Json_Response
                    (Stale_Result ("repair", E, Int_Field (E, "revision")),
                     AWS.Messages.S409);
               end if;
               if not Has_Field (B, "previewToken")
                 or else Get (B, "previewToken").Kind /= JSON_String_Type
                 or else Str_Field (B, "previewToken") = ""
               then
                  Entity_Lock_Registry.Release (Id);
                  return Fail (AWS.Messages.S400, "repair", "VALIDATION", E,
                               "repair apply requires the previewToken issued by repair-preview");
               end if;
               if not Bool_Field (B, "confirm") then
                  Entity_Lock_Registry.Release (Id);
                  return Json_Response (Confirm_Required_Result ("repair", E));
               end if;
               declare
                  Found, Used : Boolean;
                  Tok   : Preview_Token_Entry;
                  Doc   : JSON_Value;
               begin
                  Preview_Redeem
                    (Str_Field (B, "previewToken"), Found, Used, Tok);
                  if not Found or else Used
                    or else Tok.Expires < Ada.Calendar.Clock
                    or else To_String (Tok.Kind) /= Kind
                    or else To_String (Tok.Id) /= Id
                  then
                     --  no valid preview token: preview first
                     Entity_Lock_Registry.Release (Id);
                     return Json_Response
                       (Normalization_Required_Result
                          ("repair",
                           Preview_Result_Value
                             (Empty_Array, Empty_Array, Empty_Array, False, E,
                              Str_Field (B, "previewToken")),
                           Empty_Array, Empty_Array, Str_Field (B, "previewToken")),
                        AWS.Messages.S409);
                  end if;
                  --  changed bytes since the preview → never act on unseen
                  --  data
                  if To_String (Tok.Input_Hash) /= To_String (Cur_Token) then
                     Entity_Lock_Registry.Release (Id);
                     return Json_Response
                       (Stale_Result ("repair", E, -1, To_String (Cur_Token)),
                        AWS.Messages.S409);
                  end if;
                  Doc := Clone (Tok.Doc);
                  Set_Field (Doc, "revision", Int_Field (E, "revision") + 1);
                  Set_Field (Doc, "updatedAt", Now);
                  --  one snapshot (repair is a snapshot-worthy write), then
                  --  the atomic write of the previewed result
                  Snapshot (Kind, Id, "repair", E);
                  Write_Entity (Kind, Id, Doc);
                  Entity_Lock_Registry.Release (Id);
                  return Json_Response (Success_Result ("repair", Doc));
               end;
            end;
         end if;
         declare
            Op     : constant String :=
              (if Suffix'Length > 4 and then
                 Suffix (Suffix'First .. Suffix'First + 3) = "ops/"
               then Suffix (Suffix'First + 4 .. Suffix'Last) else Suffix);
            X      : AWS.Response.Data;
            Before : constant JSON_Value := Clone (E);
         begin
            --  BUG-011: reject schema-invalid requests BEFORE any mutation.
            declare
               Bad : Unbounded_String;
               Valid : Boolean := False;
            begin
               Valid := Validate_Request (Kind, Op, B, Bad);
               if not Valid then
                  Entity_Lock_Registry.Release (Id);
                  return Fail (AWS.Messages.S400, Op, "VALIDATION",
                               Message => To_String (Bad));
               end if;
            end;
            --  SC-A7: clock update reference validation (owner exists,
            --  related clocks exist, no self/duplicates) needs store
            --  access, so it runs here rather than in the pure request
            --  validator (CLOCK-OWNER-003, CLOCK-RELATED-009).
            if Kind = "clock" and then Op = "update" then
               declare
                  Bad : Unbounded_String;
               begin
                  if not Check_Clock_Refs (B, Id, Bad) then
                     Entity_Lock_Registry.Release (Id);
                     return Fail (AWS.Messages.S400, Op, "VALIDATION", E,
                                  Message => To_String (Bad));
                  end if;
               end;
            end if;
            R := Mutate (Kind, Op, E, B);
            if Bool_Field (R, "ok") then
               --  SC-A1: every write persists the complete canonical shape —
               --  a mutation that would produce a non-canonical document is
               --  rejected before any snapshot or write.
               declare
                  Mutated_Ok : Boolean;
               begin
                  Schema_Check (Kind, E, Mutated_Ok);
                  if not Mutated_Ok then
                     Entity_Lock_Registry.Release (Id);
                     return Fail (AWS.Messages.S400, Op, "VALIDATION",
                                  Message => "mutation result fails schema validation; nothing was written");
                  end if;
               end;
               --  BUG-008: snapshot only for ops declared x-snapshot:true in
               --  contract/openapi.yaml.
               if Snapshots (Op) then Snapshot (Kind, Id, Op, Before); end if;
               Stamp (E);
               Write_Entity (Kind, Id, E);
               Set_Field (R, Kind, E);
               if Header (Request, "Idempotency-Key") /= "" then
                  Idempotency_Store.Store
                    (To_String (Scope_Key), To_String (Body_Hash),
                     String'(Write (R, Compact => False)) & ASCII.LF);
               end if;
            end if;
            Entity_Lock_Registry.Release (Id);
            X := Json_Response (R);
            return X;
         end;
      end;
   exception
      when Payload_Too_Large =>
         if Lock_Held then Entity_Lock_Registry.Release (Id); end if;
         declare
            Body_Bytes : constant Ada.Streams.Stream_Element_Array :=
              AWS.Status.Binary_Data (Request);
         begin
            return Json_Response
              (Payload_Too_Large_Result
                 (Suffix, Integer (Body_Bytes'Length)),
               AWS.Messages.S413);
         end;
      when Malformed_JSON =>
         --  SC-A3: malformed transport JSON is a 400 VALIDATION with
         --  pointer details, never a raw exception or a 500.
         if Lock_Held then Entity_Lock_Registry.Release (Id); end if;
         return Json_Response
           (Validation_Error (Suffix, "request body is not valid JSON",
                              Root_Issues ("request body is not valid JSON")),
            AWS.Messages.S400);
      when Constraint_Error =>
         if Lock_Held then Entity_Lock_Registry.Release (Id); end if;
         return Json_Response
           (Validation_Error (Suffix, "invalid request",
                              Root_Issues ("invalid request")),
            AWS.Messages.S400);
   end Handle_Entity;

   --  SC-A5: game-settings startup validation and loading.  The expanded
   --  settings schema (data/games/game-settings-schema.json) is enforced
   --  structurally here — the generated validator unit covers entity DTO
   --  schemas only, so settings validation lives in this server boundary.
   --  An invalid or missing settings file aborts startup loudly.
   Startup_Failure : exception;

   procedure Settings_Error (Where, Message : String) is
   begin
      raise Startup_Failure with "game settings (" & Where & "): " & Message;
   end Settings_Error;

   function S_Str (V : JSON_Value; Key : String; Where : String) return String is
   begin
      if V.Kind /= JSON_Object_Type or else not Has_Field (V, Key) then
         Settings_Error (Where, "missing required field " & Key);
      end if;
      declare
         R : constant JSON_Value := Get (V, Key);
      begin
         if R.Kind /= JSON_String_Type then
            Settings_Error (Where, Key & " must be a string");
         end if;
         return Get (R);
      end;
   end S_Str;

   function S_Int (V : JSON_Value; Key : String; Where : String) return Integer is
   begin
      if V.Kind /= JSON_Object_Type or else not Has_Field (V, Key) then
         Settings_Error (Where, "missing required field " & Key);
      end if;
      declare
         R : constant JSON_Value := Get (V, Key);
      begin
         if R.Kind /= JSON_Int_Type then
            Settings_Error (Where, Key & " must be an integer");
         end if;
         return Get (R);
      end;
   end S_Int;

   function S_Obj (V : JSON_Value; Key : String; Where : String) return JSON_Value is
   begin
      if V.Kind /= JSON_Object_Type or else not Has_Field (V, Key) then
         Settings_Error (Where, "missing required field " & Key);
      end if;
      declare
         R : constant JSON_Value := Get (V, Key);
      begin
         if R.Kind /= JSON_Object_Type then
            Settings_Error (Where, Key & " must be an object");
         end if;
         return R;
      end;
   end S_Obj;

   function S_Arr (V : JSON_Value; Key : String; Where : String) return JSON_Array is
   begin
      if V.Kind /= JSON_Object_Type or else not Has_Field (V, Key) then
         Settings_Error (Where, "missing required field " & Key);
      end if;
      declare
         R : constant JSON_Value := Get (V, Key);
      begin
         if R.Kind /= JSON_Array_Type then
            Settings_Error (Where, Key & " must be an array");
         end if;
         return Get (R);
      end;
   end S_Arr;

   procedure S_Require_Str (V : JSON_Value; Key : String; Where : String) is
      Dummy : constant String := S_Str (V, Key, Where);
   begin
      null;
   end S_Require_Str;

   procedure S_Require_Int (V : JSON_Value; Key : String; Where : String) is
      Dummy : constant Integer := S_Int (V, Key, Where);
   begin
      null;
   end S_Require_Int;

   procedure S_Require_Arr (V : JSON_Value; Key : String; Where : String) is
      Dummy : constant JSON_Array := S_Arr (V, Key, Where);
   begin
      null;
   end S_Require_Arr;

   S_Extra_Allowed : Unbounded_String := Null_Unbounded_String;
   S_Extra_Bad     : Unbounded_String := Null_Unbounded_String;
   procedure S_Extra_Scan (Name : UTF8_String; Value : JSON_Value) is
   begin
      if Length (S_Extra_Bad) = 0 and then
        Ada.Strings.Fixed.Index
          (To_String (S_Extra_Allowed), "|" & String (Name) & "|") = 0
      then
         S_Extra_Bad := To_Unbounded_String (String (Name));
      end if;
   end S_Extra_Scan;

   procedure S_No_Extra (V : JSON_Value; Allowed : String; Where : String) is
   begin
      if V.Kind /= JSON_Object_Type then return; end if;
      S_Extra_Allowed := To_Unbounded_String (Allowed);
      S_Extra_Bad := Null_Unbounded_String;
      Map_JSON_Object (V, S_Extra_Scan'Access);
      if Length (S_Extra_Bad) > 0 then
         Settings_Error (Where, "unknown field """ & To_String (S_Extra_Bad) & """");
      end if;
   end S_No_Extra;

   procedure Validate_Game_Settings (V : JSON_Value; Stem : String) is
      Where : constant String := Stem & ".json";
   begin
      if V.Kind /= JSON_Object_Type then
         Settings_Error (Where, "settings root must be an object");
      end if;
      S_No_Extra
        (V,
         "|Name|Language|Playbooks|Traumas|Heritages|Vices|Attributes|" &
         "Backgrounds|SharedItems|Thesaurus|RecoveryClockSize|" &
         "ActionPointMaximum|FactionStatus|StressMax|TraumaMax|HarmCapacities|" &
         "XpTrackMaxima|FundMaxima|CrewTrackerMaxima|TurfMax|CrewTierMax|" &
         "CrewStashBaseCapacity|LoadMaxima|" &
         "ActionCap|SessionExpressionMax|DevelopCoinCostMultiplier|" &
         "ClockPurposes|StartingAbility|ExtraDescription|" &
         "StartingActionDots|StartingActionDotMax|",
         Where);
      S_Require_Str (V, "Name", Where);
      S_Require_Arr (V, "Playbooks", Where);
      S_Require_Arr (V, "Traumas", Where);
      S_Require_Arr (V, "Heritages", Where);
      S_Require_Arr (V, "Vices", Where);
      S_Require_Arr (V, "Attributes", Where);
      S_Require_Arr (V, "Backgrounds", Where);
      S_Require_Arr (V, "SharedItems", Where);
      S_Require_Int (V, "RecoveryClockSize", Where);
      S_Require_Int (V, "ActionPointMaximum", Where);
      declare
         FS : constant JSON_Value := S_Obj (V, "FactionStatus", Where);
      begin
         S_No_Extra (FS, "|Min|Max|", Where);
         S_Require_Int (FS, "Min", Where);
         S_Require_Int (FS, "Max", Where);
      end;
      S_Require_Int (V, "StressMax", Where);
      S_Require_Int (V, "TraumaMax", Where);
      declare
         HC : constant JSON_Value := S_Obj (V, "HarmCapacities", Where);
      begin
         S_No_Extra (HC, "|Lesser|Moderate|Severe|Fatal|", Where);
         S_Require_Int (HC, "Lesser", Where);
         S_Require_Int (HC, "Moderate", Where);
         S_Require_Int (HC, "Severe", Where);
         S_Require_Int (HC, "Fatal", Where);
      end;
      declare
         XP : constant JSON_Value := S_Obj (V, "XpTrackMaxima", Where);
      begin
         S_No_Extra (XP, "|Playbook|Attribute|Crew|", Where);
         S_Require_Int (XP, "Playbook", Where);
         S_Require_Int (XP, "Attribute", Where);
         S_Require_Int (XP, "Crew", Where);
      end;
      declare
         FM : constant JSON_Value := S_Obj (V, "FundMaxima", Where);
      begin
         S_No_Extra (FM, "|SatchelMax|StashMax|StashToCoinRate|", Where);
         S_Require_Int (FM, "SatchelMax", Where);
         S_Require_Int (FM, "StashMax", Where);
         S_Require_Int (FM, "StashToCoinRate", Where);
      end;
      declare
         CTM : constant JSON_Value := S_Obj (V, "CrewTrackerMaxima", Where);
      begin
         S_No_Extra (CTM, "|HeatMax|WantedMax|RepMax|", Where);
         S_Require_Int (CTM, "HeatMax", Where);
         S_Require_Int (CTM, "WantedMax", Where);
         S_Require_Int (CTM, "RepMax", Where);
      end;
      S_Require_Int (V, "TurfMax", Where);
      --  CONTRACT-04: required crew progression bounds (all four games).
      S_Require_Int (V, "CrewTierMax", Where);
      if S_Int (V, "CrewTierMax", Where) < 0 then
         Settings_Error (Where, "CrewTierMax must not be negative");
      end if;
      S_Require_Int (V, "CrewStashBaseCapacity", Where);
      if S_Int (V, "CrewStashBaseCapacity", Where) < 0 then
         Settings_Error (Where, "CrewStashBaseCapacity must not be negative");
      end if;
      declare
         LM  : constant JSON_Value := S_Obj (V, "LoadMaxima", Where);
         CMB : constant JSON_Value := S_Obj (LM, "CommitmentMaxBulk", Where);
      begin
         S_No_Extra (LM, "|MaxBulk|CommitmentMaxBulk|", Where);
         S_Require_Int (LM, "MaxBulk", Where);
         S_No_Extra (CMB, "|Light|Normal|Heavy|Encumbered|", Where);
         S_Require_Int (CMB, "Light", Where);
         S_Require_Int (CMB, "Normal", Where);
         S_Require_Int (CMB, "Heavy", Where);
         S_Require_Int (CMB, "Encumbered", Where);
      end;
      declare
         AC : constant JSON_Value := S_Obj (V, "ActionCap", Where);
      begin
         S_No_Extra (AC, "|Base|Mastery|", Where);
         S_Require_Int (AC, "Base", Where);
         S_Require_Int (AC, "Mastery", Where);
      end;
      S_Require_Int (V, "SessionExpressionMax", Where);
      S_Require_Int (V, "DevelopCoinCostMultiplier", Where);
      declare
         CP      : constant JSON_Array := S_Arr (V, "ClockPurposes", Where);
         Allowed : constant String :=
           "progress|danger|racing|linked|mission|tug-of-war|" &
           "long-term-project|faction|score|custom";
      begin
         for I in 1 .. Length (CP) loop
            declare
               Item : constant JSON_Value := Get (CP, I);
            begin
               if Item.Kind /= JSON_String_Type then
                  Settings_Error (Where, "ClockPurposes must contain strings only");
               end if;
               declare
                  Name : constant String := String'(Get (Item));
                  P  : Natural := 1;
                  E  : Natural := 1;
                  Ok : Boolean := False;
               begin
                  while E <= Allowed'Length + 1 loop
                     if E > Allowed'Length or else Allowed (E) = '|' then
                        if Allowed (P .. E - 1) = Name then Ok := True; exit; end if;
                        P := E + 1;
                     end if;
                     E := E + 1;
                  end loop;
                  if not Ok then
                     Settings_Error
                       (Where, "ClockPurposes value """ & Name & """ out of enum");
                  end if;
                  for J in 1 .. I - 1 loop
                     if String'(Get (Get (CP, J))) = Name then
                        Settings_Error
                          (Where, "ClockPurposes must be unique; duplicate """ & Name & """");
                     end if;
                  end loop;
               end;
            end;
         end loop;
      end;
      --  consumed structures: playbook special abilities (TimesTakeable)
      --  and attribute action names are read by the capability projections
      declare
         PBs : constant JSON_Array := Get (V, "Playbooks");
      begin
         for I in 1 .. Length (PBs) loop
            declare PB : constant JSON_Value := Get (PBs, I); begin
               if PB.Kind /= JSON_Object_Type then
                  Settings_Error (Where, "Playbooks[" & Trim_Image (I) & "] must be an object");
               end if;
               S_Require_Str (PB, "Name", Where);
               if Has_Field (PB, "SpecialAbilities") then
                  declare
                     SAs : constant JSON_Array := Get (PB, "SpecialAbilities");
                  begin
                     for J in 1 .. Length (SAs) loop
                        declare SA : constant JSON_Value := Get (SAs, J); begin
                           if SA.Kind /= JSON_Object_Type then
                              Settings_Error
                                (Where, "SpecialAbilities[" & Trim_Image (J) & "] must be an object");
                           end if;
                           S_Require_Str (SA, "Name", Where);
                           if S_Int (SA, "TimesTakeable", Where) < 1 then
                              Settings_Error (Where, "TimesTakeable must be at least 1");
                           end if;
                        end;
                     end loop;
                  end;
               end if;
            end;
         end loop;
      end;
      declare
         Attrs : constant JSON_Array := Get (V, "Attributes");
      begin
         for I in 1 .. Length (Attrs) loop
            declare A0 : constant JSON_Value := Get (Attrs, I); begin
               if A0.Kind /= JSON_Object_Type then
                  Settings_Error (Where, "Attributes[" & Trim_Image (I) & "] must be an object");
               end if;
               S_Require_Str (A0, "Name", Where);
               if Has_Field (A0, "Actions") then
                  declare
                     Acts : constant JSON_Array := Get (A0, "Actions");
                  begin
                     for J in 1 .. Length (Acts) loop
                        declare X : constant JSON_Value := Get (Acts, J); begin
                           if X.Kind /= JSON_Object_Type then
                              Settings_Error (Where, "Attributes[].Actions[] must be objects");
                           end if;
                           S_Require_Str (X, "Name", Where);
                        end;
                     end loop;
                  end;
               end if;
            end;
         end loop;
      end;
   end Validate_Game_Settings;

   procedure Validate_Crew_Settings (V : JSON_Value; Stem : String) is
      Where : constant String := Stem & "-crews.json";
   begin
      if V.Kind /= JSON_Object_Type then
         Settings_Error (Where, "crew settings root must be an object");
      end if;
      S_No_Extra (V, "|Name|Language|CrewTypes|", Where);
      S_Require_Str (V, "Name", Where);
      S_Require_Str (V, "Language", Where);
      declare
         CTs : constant JSON_Array := S_Arr (V, "CrewTypes", Where);
      begin
         for I in 1 .. Length (CTs) loop
            declare T : constant JSON_Value := Get (CTs, I); begin
               if T.Kind /= JSON_Object_Type then
                  Settings_Error (Where, "CrewTypes[" & Trim_Image (I) & "] must be an object");
               end if;
               S_No_Extra
                 (T,
                  "|Name|Hook|Description|ExperienceTrigger|SpecialAbilities|" &
                  "Upgrades|StartingUpgrades|Contacts|FavoredOperations|" &
                  "Reputations|Claims|",
                  Where);
               S_Require_Str (T, "Name", Where);
               S_Require_Str (T, "Hook", Where);
               S_Require_Str (T, "Description", Where);
               S_Require_Str (T, "ExperienceTrigger", Where);
               declare
                  SAs : constant JSON_Array := S_Arr (T, "SpecialAbilities", Where);
               begin
                  for J in 1 .. Length (SAs) loop
                     declare SA : constant JSON_Value := Get (SAs, J); begin
                        if SA.Kind /= JSON_Object_Type then
                           Settings_Error
                             (Where, "SpecialAbilities[" & Trim_Image (J) & "] must be an object");
                        end if;
                        S_No_Extra (SA, "|Name|TimesTakeable|Description|", Where);
                        S_Require_Str (SA, "Name", Where);
                        if S_Int (SA, "TimesTakeable", Where) < 1 then
                           Settings_Error (Where, "TimesTakeable must be at least 1");
                        end if;
                     end;
                  end loop;
               end;
               declare
                  Ups : constant JSON_Array := S_Arr (T, "Upgrades", Where);
               begin
                  for J in 1 .. Length (Ups) loop
                     declare UP : constant JSON_Value := Get (Ups, J); begin
                        if UP.Kind /= JSON_Object_Type then
                           Settings_Error
                             (Where, "Upgrades[" & Trim_Image (J) & "] must be an object");
                        end if;
                        S_No_Extra
                          (UP, "|Name|TotalBoxes|Description|StashCapacities|",
                           Where);
                        S_Require_Str (UP, "Name", Where);
                        if S_Int (UP, "TotalBoxes", Where) < 1 then
                           Settings_Error (Where, "TotalBoxes must be at least 1");
                        end if;
                        --  CONTRACT-04: optional vault capacity table,
                        --  indexed by boxes marked (non-empty positive ints).
                        if Has_Field (UP, "StashCapacities") then
                           declare
                              SCs : constant JSON_Array :=
                                S_Arr (UP, "StashCapacities", Where);
                           begin
                              if Length (SCs) < 1 then
                                 Settings_Error
                                   (Where, "StashCapacities must not be empty");
                              end if;
                              for K in 1 .. Length (SCs) loop
                                 declare SV : constant JSON_Value := Get (SCs, K);
                                 begin
                                    if SV.Kind /= JSON_Int_Type
                                      or else Integer'(Get (SV)) < 1
                                    then
                                       Settings_Error
                                         (Where,
                                          "StashCapacities entries must be "
                                          & "positive integers");
                                    end if;
                                 end;
                              end loop;
                           end;
                        end if;
                     end;
                  end loop;
               end;
               if Has_Field (T, "StartingUpgrades") then
                  declare
                     SUps : constant JSON_Array := Get (T, "StartingUpgrades");
                  begin
                     for J in 1 .. Length (SUps) loop
                        declare UP : constant JSON_Value := Get (SUps, J); begin
                           if UP.Kind /= JSON_Object_Type then
                              Settings_Error
                                (Where, "StartingUpgrades[" & Trim_Image (J) & "] must be an object");
                           end if;
                           S_Require_Str (UP, "Name", Where);
                        end;
                     end loop;
                  end;
               end if;
               if Has_Field (T, "Contacts") then
                  declare
                     Cs : constant JSON_Array := Get (T, "Contacts");
                  begin
                     for J in 1 .. Length (Cs) loop
                        if Get (Cs, J).Kind /= JSON_Object_Type then
                           Settings_Error
                             (Where, "Contacts[" & Trim_Image (J) & "] must be an object");
                        end if;
                     end loop;
                  end;
               end if;
               if Has_Field (T, "FavoredOperations") then
                  declare
                     FOs : constant JSON_Array := Get (T, "FavoredOperations");
                  begin
                     for J in 1 .. Length (FOs) loop
                        if Get (FOs, J).Kind /= JSON_String_Type then
                           Settings_Error
                             (Where, "FavoredOperations must contain strings only");
                        end if;
                     end loop;
                  end;
               end if;
               if Has_Field (T, "Reputations") then
                  declare
                     Rs : constant JSON_Array := Get (T, "Reputations");
                  begin
                     for J in 1 .. Length (Rs) loop
                        if Get (Rs, J).Kind /= JSON_String_Type then
                           Settings_Error (Where, "Reputations must contain strings only");
                        end if;
                     end loop;
                  end;
               end if;
               if Has_Field (T, "Claims") then
                  declare
                     C : constant JSON_Value := Get (T, "Claims");
                  begin
                     if C.Kind /= JSON_Object_Type then
                        Settings_Error (Where, "Claims must be an object");
                     end if;
                     S_No_Extra (C, "|Columns|Rows|Nodes|Edges|", Where);
                     S_Require_Int (C, "Columns", Where);
                     S_Require_Int (C, "Rows", Where);
                     declare
                        Ns : constant JSON_Array := S_Arr (C, "Nodes", Where);
                     begin
                        for J in 1 .. Length (Ns) loop
                           declare N : constant JSON_Value := Get (Ns, J); begin
                              if N.Kind /= JSON_Object_Type then
                                 Settings_Error
                                   (Where, "Claims.Nodes[" & Trim_Image (J) & "] must be an object");
                              end if;
                              S_No_Extra (N, "|Id|Name|Description|Kind|Column|Row|Effects|", Where);
                              S_Require_Str (N, "Id", Where);
                              S_Require_Str (N, "Name", Where);
                              S_Require_Str (N, "Description", Where);
                              declare
                                 K : constant String := S_Str (N, "Kind", Where);
                              begin
                                 if K /= "claim" and then K /= "turf" and then K /= "lair" then
                                    Settings_Error
                                      (Where, "claim Kind must be claim, turf or lair");
                                 end if;
                              end;
                              S_Require_Int (N, "Column", Where);
                              S_Require_Int (N, "Row", Where);
                              declare
                                 Es : constant JSON_Array := S_Arr (N, "Effects", Where);
                              begin
                                 for K in 1 .. Length (Es) loop
                                    declare FX : constant JSON_Value := Get (Es, K); begin
                                       if FX.Kind /= JSON_Object_Type then
                                          Settings_Error
                                            (Where, "claim Effects[] must be objects");
                                       end if;
                                       S_No_Extra (FX, "|Id|Kind|Target|Delta|", Where);
                                       S_Require_Str (FX, "Id", Where);
                                       S_Require_Str (FX, "Kind", Where);
                                       S_Require_Str (FX, "Target", Where);
                                       S_Require_Int (FX, "Delta", Where);
                                    end;
                                 end loop;
                              end;
                           end;
                        end loop;
                     end;
                     declare
                        Es : constant JSON_Array := S_Arr (C, "Edges", Where);
                     begin
                        for J in 1 .. Length (Es) loop
                           declare E : constant JSON_Value := Get (Es, J); begin
                              if E.Kind /= JSON_Object_Type then
                                 Settings_Error
                                   (Where, "Claims.Edges[" & Trim_Image (J) & "] must be an object");
                              end if;
                              S_No_Extra (E, "|From|To|", Where);
                              S_Require_Str (E, "From", Where);
                              S_Require_Str (E, "To", Where);
                           end;
                        end loop;
                     end;
                  end;
               end if;
            end;
         end loop;
      end;
   end Validate_Crew_Settings;

   procedure Load_One_Game (Stem : String) is
      Settings_Path : constant String := To_String (Games_Root) & "/" & Stem & ".json";
      Crew_Path     : constant String := To_String (Games_Root) & "/" & Stem & "-crews.json";
      V             : JSON_Value;
   begin
      if not Ada.Directories.Exists (Settings_Path) then
         Settings_Error (Stem & ".json", "settings file missing");
      end if;
      begin
         V := Read (Read_File (Settings_Path));
      exception
         when E : others =>
            Settings_Error (Stem & ".json",
                            "unreadable: " & Ada.Exceptions.Exception_Message (E));
      end;
      Validate_Game_Settings (V, Stem);
      if not Cache_Game (Stem, V) then
         Settings_Error (Stem & ".json", "too many games for the cache");
      end if;
      if Ada.Directories.Exists (Crew_Path) then
         declare
            CV : JSON_Value;
         begin
            begin
               CV := Read (Read_File (Crew_Path));
            exception
               when E : others =>
                  Settings_Error (Stem & "-crews.json",
                                  "unreadable: " & Ada.Exceptions.Exception_Message (E));
            end;
            Validate_Crew_Settings (CV, Stem);
            if not Cache_Game (Stem & "-crews", CV) then
               Settings_Error (Stem & "-crews.json", "too many games for the cache");
            end if;
         end;
      end if;
   end Load_One_Game;

   procedure Load_Settings_At_Startup is
      Index_Path : constant String := To_String (Games_Root) & "/games.json";
   begin
      if not Ada.Directories.Exists (Index_Path) then
         Settings_Error ("games.json",
                         "games index missing under " & To_String (Games_Root));
      end if;
      declare
         Index_V : JSON_Value;
         Items   : JSON_Array;
      begin
         begin
            Index_V := Read (Read_File (Index_Path));
         exception
            when E : others =>
               Settings_Error ("games.json",
                               "unreadable: " & Ada.Exceptions.Exception_Message (E));
         end;
         if Index_V.Kind /= JSON_Array_Type then
            Settings_Error ("games.json", "games index must be an array");
         end if;
         Items := Get (Index_V);
         for I in 1 .. Length (Items) loop
            declare
               Item : constant JSON_Value := Get (Items, I);
               Stem : constant String := Str_Field (Item, "Stem");
            begin
               if Stem = "" then
                  Settings_Error ("games.json", "entry " & Trim_Image (I) & " has no Stem");
               end if;
               Load_One_Game (Stem);
            end;
         end loop;
      end;
   end Load_Settings_At_Startup;

   procedure Configure (Static_Directory, Data_Directory, Games_Directory : String; Test_Hooks : Boolean) is
      Campaign : JSON_Value;
   begin
      Static_Root:=To_Unbounded_String(Static_Directory);Data_Root:=To_Unbounded_String(Data_Directory);Games_Root:=To_Unbounded_String(Games_Directory);Hooks:=Test_Hooks;
      if not Ada.Directories.Exists(Data_Directory) then Ada.Directories.Create_Path(Data_Directory);end if;
      if not Ada.Directories.Exists(Data_Directory&"/campaign.json") then Campaign:=Create_Object;Set_Field(Campaign,"kind","campaign");Set_Field(Campaign,"name","Paperclips Campaign");Set_Field(Campaign,"gameStem","blades-in-the-dark");Set_Field(Campaign,"createdAt",Now);Set_Field(Campaign,"formatVersion",Integer'(1));Atomic_Write(Data_Directory&"/campaign.json",Campaign);end if;
      --  SC-A5: validate and cache every game settings file (and crew
      --  catalog when present) before the server starts listening; any
      --  invalid file raises Startup_Failure and aborts startup loudly.
      Load_Settings_At_Startup;
   end Configure;

   function Handle (Request : AWS.Status.Data) return AWS.Response.Data is
      URI:constant String:=AWS.Status.URI(Request);Path:constant String:=Path_Only(URI);Response:AWS.Response.Data;
   begin
      if Path="/api/health" then declare V:JSON_Value:=Create_Object;begin Set_Field(V,"status","ok");Set_Field(V,"implementation","ada");Set_Field(V,"version","0.2.0");Set_Field(V,"dataDir",To_String(Data_Root));Response:=Json_Response(V);end;
      elsif Path="/api/capabilities" then declare V:JSON_Value:=Create_Object;begin Set_Field(V,"maxPayloadBytes",Integer(Max_Import));Set_Field(V,"maxHistorySnapshots",Integer(Max_History_Snapshots));Set_Field(V,"maxBatchOperations",Integer(Max_Batch_Operations));Response:=Json_Response(V);end;
      elsif Path="/api/campaign" then Response:=Json_Text(Read_File(To_String(Data_Root)&"/campaign.json"));
      elsif Path="/api/campaign/batch" then
         --  BUG-005: sequential all-or-nothing multi-op planner.
         declare
            B    : constant JSON_Value := Parse_Body (To_String (AWS.Status.Binary_Data (Request)));
            Ops  : JSON_Array;
            Outs : JSON_Array := Empty_Array;
            OK   : Boolean := True;
            Fail_Code, Fail_Msg : Unbounded_String := Null_Unbounded_String;
            Batch_Ctx  : JSON_Value := JSON_Null;
            Batch_Issues : JSON_Array := Empty_Array;
            Batch_Canonical : Boolean := False;
            Batch_Err  : JSON_Value := JSON_Null;
            type Ent is record
               Kind : Unbounded_String := Null_Unbounded_String;
               Id   : Unbounded_String := Null_Unbounded_String;
               Op   : Unbounded_String := Null_Unbounded_String;
               Args : JSON_Value := JSON_Null;
               E    : JSON_Value := JSON_Null;
               Changed : Boolean := False;
               Req_Idx : Natural := 0;
            end record;
            Ents : array (1 .. Max_Batch_Operations) of Ent :=
              (others => (Kind => Null_Unbounded_String, Id => Null_Unbounded_String,
                          Op => Null_Unbounded_String, Args => JSON_Null,
                          E => JSON_Null, Changed => False, Req_Idx => 0));
            N    : Natural := 0;
            Locked : array (1 .. 50) of Boolean := (others => False);
         begin
            if B.Kind /= JSON_Object_Type or else not Has_Field (B, "ops") then
               Response := Json_Response
                 (Validation_Error ("batch", "ops must be a non-empty array",
                                    Root_Issues ("ops must be a non-empty array")));
            else
               Ops := Get (B, "ops");
               if Length (Ops) = 0 or else Length (Ops) > Max_Batch_Operations then
                  Response := Json_Response
                    (Validation_Error ("batch", "ops must contain 1..50 operations",
                                       Root_Issues ("ops must contain 1..50 operations")));
               else
                  for I in 1 .. Length (Ops) loop
                     declare
                        O   : constant JSON_Value := Get (Ops, I);
                        K, ID, OP : Unbounded_String := Null_Unbounded_String;
                     begin
                        if O.Kind /= JSON_Object_Type
                          or else not Has_Field (O, "entity")
                          or else not Has_Field (O, "id")
                          or else not Has_Field (O, "op")
                          or else not Has_Field (O, "args")
                        then
                           OK := False; Fail_Code := To_Unbounded_String ("VALIDATION");
                           Fail_Msg := To_Unbounded_String ("each op requires entity, id, op, args");
                           exit;
                        end if;
                        K := To_Unbounded_String (Str_Field (O, "entity"));
                        if To_String (K) /= "character" and then To_String (K) /= "crew"
                          and then To_String (K) /= "clock" then
                           OK := False; Fail_Code := To_Unbounded_String ("VALIDATION");
                           Fail_Msg := To_Unbounded_String ("entity must be character, crew or clock");
                           exit;
                        end if;
                        ID := To_Unbounded_String (Str_Field (O, "id"));
                        OP := To_Unbounded_String (Str_Field (O, "op"));
                        if not Safe (To_String (ID)) then
                           OK := False; Fail_Code := To_Unbounded_String ("VALIDATION");
                           Fail_Msg := To_Unbounded_String ("invalid entity id");
                           exit;
                        end if;
                        N := N + 1;
                        Ents (N) := (Kind => K, Id => ID,
                                     Op => OP, Args => Get (O, "args"),
                                     E => JSON_Null, Changed => False,
                                     Req_Idx => N);
                        --  SC-A3: batch shares the ONE stored-entity
                        --  classification path (degraded rows → typed
                        --  INVALID_ENTITY with repairability details).
                        if Ada.Directories.Exists
                          (Current_File (To_String (K), To_String (ID)))
                        then
                           Classify_Stored
                             (To_String (K), To_String (ID),
                              Read_File (Current_File (To_String (K), To_String (ID))),
                              Ents (N).E, Batch_Ctx, Batch_Issues, Batch_Canonical);
                           if not Batch_Canonical then
                              OK := False;
                              Fail_Code := To_Unbounded_String ("INVALID_ENTITY");
                              Fail_Msg := To_Unbounded_String
                                ("entity is degraded; repair before mutating");
                              Batch_Err := Invalid_Entity_Error ("batch", Batch_Issues);
                              exit;
                           end if;
                        else
                           OK := False; Fail_Code := To_Unbounded_String ("NOT_FOUND");
                           Fail_Msg := To_Unbounded_String
                             ("entity not found: " & To_String (K) & "/" & To_String (ID));
                           exit;
                        end if;
                     end;
                  end loop;
                  if OK then
                     for I in 1 .. N - 1 loop
                        for J in I + 1 .. N loop
                           declare
                              KI : constant String := To_String (Ents (I).Kind) & "/" & To_String (Ents (I).Id);
                              KJ : constant String := To_String (Ents (J).Kind) & "/" & To_String (Ents (J).Id);
                           begin
                              if KJ < KI then
                                 declare T : Ent := Ents (I); begin
                                    Ents (I) := Ents (J); Ents (J) := T;
                                 end;
                              end if;
                           end;
                        end loop;
                     end loop;
                     for I in 1 .. N loop
                        declare
                           H : Boolean;
                           Already : Boolean := False;
                           KeyI : constant String :=
                             To_String (Ents (I).Kind) & "/" & To_String (Ents (I).Id);
                        begin
                           for P in 1 .. I - 1 loop
                              if To_String (Ents (P).Kind) & "/" & To_String (Ents (P).Id) = KeyI
                              then
                                 Already := True; exit;
                              end if;
                           end loop;
                           if not Already then
                              --  bounded spin like the per-entity routes: a
                              --  transiently busy registry must not fail a
                              --  whole batch under parallel load
                              Entity_Lock_Registry.Claim (To_String (Ents (I).Id), 0, H);
                              for T in 1 .. 200 loop
                                 exit when H;
                                 delay 0.001;
                                 Entity_Lock_Registry.Claim (To_String (Ents (I).Id), 0, H);
                              end loop;
                              if not H then OK := False; Fail_Code := To_Unbounded_String ("VALIDATION");
                                 Fail_Msg := To_Unbounded_String ("too many concurrent batches");
                                 exit;
                              end if;
                           end if;
                           Locked (I) := not Already;
                        end;
                     end loop;
                  end if;
                  if OK then
                     for I in 1 .. N loop
                        declare
                           R   : JSON_Value;
                           OpS : constant String := To_String (Ents (I).Op);
                           KeyI : constant String :=
                             To_String (Ents (I).Kind) & "/" & To_String (Ents (I).Id);
                        begin
                           for P in reverse 1 .. I - 1 loop
                              if To_String (Ents (P).Kind) & "/" & To_String (Ents (P).Id) = KeyI
                                and then Ents (P).Changed
                              then
                                 Ents (I).E := Ents (P).E;
                                 exit;
                              end if;
                           end loop;
                           --  SC-A1: batch is a write path — the stored
                           --  entity must be canonical before mutating, and
                           --  every mutation must keep it canonical.
                           if not Entity_Is_Canonical
                             (To_String (Ents (I).Kind), To_String (Ents (I).Id),
                              Ents (I).E)
                           then
                              OK := False;
                              Fail_Code := To_Unbounded_String ("INVALID_ENTITY");
                              Fail_Msg := To_Unbounded_String
                                ("entity is degraded; repair before mutating");
                              exit;
                           end if;
                           R := Mutate (To_String (Ents (I).Kind), OpS, Ents (I).E, Ents (I).Args);
                           if Bool_Field (R, "ok") then
                              declare
                                 Batch_Mutated_Ok : Boolean;
                              begin
                                 Schema_Check (To_String (Ents (I).Kind), Ents (I).E,
                                                       Batch_Mutated_Ok);
                                 if not Batch_Mutated_Ok then
                                    OK := False;
                                    Fail_Code := To_Unbounded_String ("VALIDATION");
                                    Fail_Msg := To_Unbounded_String
                                      ("mutation result fails schema validation; nothing was written");
                                    exit;
                                 end if;
                              end;
                              Ents (I).Changed := True;
                              Append (Outs, Read ("{""ok"":true,""op"":""" & OpS & """}"));
                           else
                              OK := False;
                              --  SC-A3: batch items carry the same whole-error
                              --  union as the top-level error (ERR-BATCH-008).
                              --  All planned items are still evaluated and
                              --  reported (all-or-nothing refers to writes:
                              --  nothing is written once any item failed).
                              declare
                                 Item : JSON_Value := Create_Object;
                                 Err  : constant JSON_Value := Get (R, "error");
                              begin
                                 Set_Field (Item, "ok", False);
                                 Set_Field (Item, "op", Create (OpS));
                                 Set_Field (Item, "error", Err);
                                 Append (Outs, Item);
                              end;
                           end if;
                        end;
                     end loop;
                  end if;
                  if OK then
                     for I in 1 .. N loop
                        declare
                           K : constant String := To_String (Ents (I).Kind);
                           ID : constant String := To_String (Ents (I).Id);
                           OpS : constant String := To_String (Ents (I).Op);
                           KeyI : constant String := K & "/" & ID;
                           Seen : Boolean := False;
                        begin
                           for P in 1 .. I - 1 loop
                              if To_String (Ents (P).Kind) & "/" & To_String (Ents (P).Id) = KeyI
                              then Seen := True; exit; end if;
                           end loop;
                           if not Seen then
                              declare
                                 Before : constant JSON_Value := Clone (Read_Entity (K, ID));
                              begin
                                 if Snapshots (OpS) then Snapshot (K, ID, OpS, Before); end if;
                                 Stamp (Ents (I).E);
                                 Write_Entity (K, ID, Ents (I).E);
                              end;
                           end if;
                        end;
                     end loop;
                     declare V : JSON_Value := Create_Object; begin
                        Set_Field (V, "ok", True);
                        Set_Field (V, "applied", Create_Object);
                        Set_Field (Get (V, "applied"), "op", "campaign.batch");
                        Set_Field (V, "batch", Outs);
                        Set_Field (V, "sideEffects", Empty_Array);
                        Set_Field (V, "error", JSON_Null);
                        Response := Json_Response (V);
                     end;
                  else
                     if Length (Outs) = N then
                        --  SC-A3: outcomes are reported in REQUEST order —
                        --  the planner sorts entities only for lock ordering.
                        declare
                           Reordered : JSON_Array := Empty_Array;
                        begin
                           for K in 1 .. N loop
                              for L in 1 .. N loop
                                 if Ents (L).Req_Idx = K then
                                    Append (Reordered, Get (Outs, L));
                                    exit;
                                 end if;
                              end loop;
                           end loop;
                           Outs := Reordered;
                        end;
                     end if;
                     if Length (Outs) > 0 then
                        --  SC-A3: per-item outcomes carry the failing item's
                        --  typed union error; the batch envelope stays 200
                        --  with batch=Outs (all-or-nothing: nothing written).
                        declare V : JSON_Value := Create_Object; begin
                           Set_Field (V, "ok", True);
                           Set_Field (V, "applied", Create_Object);
                           Set_Field (Get (V, "applied"), "op", "campaign.batch");
                           Set_Field (V, "batch", Outs);
                           Set_Field (V, "sideEffects", Empty_Array);
                           Set_Field (V, "error", JSON_Null);
                           Response := Json_Response (V);
                        end;
                     elsif Batch_Err.Kind = JSON_Object_Type then
                        Response := Json_Response (Batch_Err);
                     else
                        Response := Json_Response
                          (Error_Result ("batch", To_String (Fail_Code), To_String (Fail_Msg)));
                     end if;
                  end if;
                  for I in 1 .. N loop
                     if Locked (I) then Entity_Lock_Registry.Release (To_String (Ents (I).Id)); end if;
                  end loop;
               end if;
            end if;
         end;
      elsif Path="/api/campaign/roster" then
         --  SC-A3: the roster shares the stored-entity classification path
         --  (route identity, isReadable flags); collections stay 200.
         Response := Json_Response (Roster_Value);
      elsif Path'Length >= 28 and then
        Path (Path'First .. Path'First + 18) = "/api/campaign/crew/" and then
        Path (Path'Last - 7 .. Path'Last) = "/members"
      then
         --  BUG-007: GET /api/campaign/crew/{crewId}/members returns the
         --  character summaries linked to that crew (declared 200 route).
         --  SC-A4: per-member isolation — the crew's existence is route-
         --  derived (Q15, the directory is authoritative), so an unreadable
         --  crew still lists its readable members; one unreadable member
         --  never removes valid rows and never changes the 200 status.
         declare
            Crew_Id : constant String :=
              Path (Path'First + 19 .. Path'Last - 8);
            Rows : constant JSON_Array := Character_Rows;
            Out_A : JSON_Array := Empty_Array;
         begin
            if not Ada.Directories.Exists (Entity_Dir ("crew", Crew_Id)) then
               Response := Fail (AWS.Messages.S404, "crew.members", "NOT_FOUND",
                                 Message => "crew not found");
            else
               for I in 1 .. Length (Rows) loop
                  declare
                     R : constant JSON_Value := Get (Rows, I);
                  begin
                     if Str_Field (R, "crewId") = Crew_Id
                       and then Bool_Field (R, "isReadable")
                     then
                        Append (Out_A, R);
                     end if;
                  end;
               end loop;
               Response := Json_Response (Create (Out_A));
            end if;
         end;
      elsif Part(Path,1)="api" and then Part(Path,2)="games" then Response:=Handle_Games(Path);
      elsif Part(Path,1)="api" and then Part(Path,2)="characters"
              and then Part(Path,3)="pc" and then Part(Path,4)=""
      then Response:=Handle_Pc_Create(Request);
      elsif Part(Path,1)="api" and then (Part(Path,2)="characters" or else Part(Path,2)="crews" or else Part(Path,2)="clocks") then Response:=Handle_Entity(Request,Path);
      elsif Path="/api/test-hooks/crash-mid-write" then
         --  SC-A2: crash probe (REPAIR-ATOMIC-004).  Armed only when the
         --  server runs with --test-hooks; the hook fires on the next write
         --  of the named entity's current.json (aborts mid-write, leaving
         --  the old file intact).  Returns 204 when armed, 501 otherwise.
         if not Hooks then
            Response := AWS.Response.Build (AWS.MIME.Text_Plain, "", AWS.Messages.S501);
         else
            declare
               B : constant JSON_Value := Parse_Body
                 (To_String (AWS.Status.Binary_Data (Request)));
            begin
               if B.Kind = JSON_Object_Type and then
                 Str_Field (B, "entity") = "character" and then
                 Str_Field (B, "id") /= ""
               then
                  Crash_Arm (Str_Field (B, "id"));
                  Response := AWS.Response.Build (AWS.MIME.Text_Plain, "", AWS.Messages.S204);
               else
                  Response := AWS.Response.Build (AWS.MIME.Text_Plain, "", AWS.Messages.S400);
               end if;
            end;
         end if;
      elsif Path'Length>=5 and then Path(Path'First..Path'First+4)="/api/" then Response:=Fail(AWS.Messages.S404,"request","NOT_FOUND");
      elsif AWS.Status.Method(Request)=AWS.Status.GET or else AWS.Status.Method(Request)=AWS.Status.HEAD then
         declare
            N : constant String := To_String (Static_Root) &
              (if Path = "/" then "/index.html" else Path);
            Index_File : constant String := To_String (Static_Root) & "/index.html";
         begin
            if Path'Length > 1 and then Ada.Strings.Fixed.Index (Path, "..") /= 0 then
               Response := AWS.Response.Acknowledge
                 (AWS.Messages.S404, "Not found", AWS.MIME.Text_Plain);
            elsif Ada.Directories.Exists (N) and then
              Ada.Directories.Kind (N) = Ada.Directories.Ordinary_File
            then
               Response := AWS.Response.File (AWS.MIME.Content_Type (N), N);
            elsif Ada.Strings.Fixed.Index (Path, ".") = 0 and then
              Ada.Directories.Exists (Index_File)
            then
               Response := AWS.Response.File (AWS.MIME.Text_HTML, Index_File);
            else
               Response := AWS.Response.Acknowledge
                 (AWS.Messages.S404, "Not found", AWS.MIME.Text_Plain);
            end if;
         end;
      else Response:=AWS.Response.Acknowledge(AWS.Messages.S405,"Method not allowed",AWS.MIME.Text_Plain);end if;
      Ada.Text_IO.Put_Line("{""method"":"""&AWS.Status.Method(Request)&""",""path"":"""&Path&""",""status"":"&AWS.Messages.Image(AWS.Response.Status_Code(Response))&"}");return Response;
   exception when E:others =>
      --  SC-A3: the typed union is the only error channel — the raw
      --  exception stays in the server log, never in the response body.
      Ada.Text_IO.Put_Line (Ada.Exceptions.Exception_Information (E));
      return Json_Response
        (Validation_Error ("request", "invalid request",
                           Root_Issues ("invalid request")),
         AWS.Messages.S400);
   end Handle;
end Pitd_Callback;
