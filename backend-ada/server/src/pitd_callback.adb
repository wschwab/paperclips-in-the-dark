with Ada.Calendar;
with Ada.Calendar.Formatting;
with Ada.Directories;
with Ada.Exceptions;
with Ada.Streams.Stream_IO;
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
with AWS.Utils;
with GNAT.OS_Lib;
with GNAT.SHA256;
with GNATCOLL.JSON;
with Interfaces.C;
with Paperclips_Core;
with Paperclips_Core.Bounded_Integers;
with Paperclips_Core.Clocks;
with Paperclips_Core.Experience_Trackers;
with Paperclips_Core.Monitors;
with Pitd_Error;
with Pitd_Schema_Validators;
with System;

package body Pitd_Callback is
   use Ada.Strings.Unbounded;
   use GNATCOLL.JSON;
   use Pitd_Error;
   use type Ada.Calendar.Time;
   use type Ada.Directories.File_Kind;
   use type AWS.Status.Request_Method;
   use type GNAT.OS_Lib.File_Descriptor;
   use type Interfaces.C.int;

   Static_Root : Unbounded_String := To_Unbounded_String ("./frontend/dist");
   Data_Root   : Unbounded_String := To_Unbounded_String ("./campaign-data");
   Games_Root  : Unbounded_String := To_Unbounded_String ("./data/games");
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

   --  Monotonic clock for the 17-digit snapshot prefix: milliseconds since
   --  the Ada epoch, zero-padded.  Strictly increasing within a server
   --  lifetime (tie-broken against the wall clock) and wall-clock-based
   --  across restarts, so snapshot filename lexicographic order always
   --  equals creation order (BUG-008).
   protected Snapshot_Clock is
      procedure Next (Prefix : out Long_Long_Integer);
   private
      Last_Prefix : Long_Long_Integer := 0;
   end Snapshot_Clock;

   protected body Snapshot_Clock is
      procedure Next (Prefix : out Long_Long_Integer) is
         Now_Ms : Long_Long_Integer;
      begin
         Now_Ms := Long_Long_Integer
             (Ada.Calendar.Clock - Ada.Calendar.Time_Of (1901, 1, 1)) * 1_000;
         if Now_Ms <= Last_Prefix then Now_Ms := Last_Prefix + 1; end if;
         Last_Prefix := Now_Ms;
         Prefix := Now_Ms;
      end Next;
   end Snapshot_Clock;

   --  Unique temp-name counter for Atomic_Write (BUG-009): two concurrent
   --  writers must never share a ".tmp" name.
   protected Temp_Counter is
      procedure Next (Value : out Natural);
   private
      N : Natural := 0;
   end Temp_Counter;

   protected body Temp_Counter is
      procedure Next (Value : out Natural) is
      begin
         N := N + 1;
         Value := N;
      end Next;
   end Temp_Counter;

   --  SC-A2: --test-hooks crash probe (REPAIR-ATOMIC-004).  POST
   --  /api/test-hooks/crash-mid-write {entity, id} arms a one-shot crash on
   --  the NEXT Atomic_Write of that entity's current.json: the temp file is
   --  removed and the write aborts mid-flight, leaving the old file intact
   --  (the on-disk invariant the probe guards).  Only active when the server
   --  was started with --test-hooks.
   protected Crash_Hook is
      procedure Arm (Entity_Id : String);
      procedure Check (Target : String; Crash : out Boolean);
   private
      Armed : Boolean := False;
      Id    : Unbounded_String := Null_Unbounded_String;
   end Crash_Hook;

   protected body Crash_Hook is
      procedure Arm (Entity_Id : String) is
      begin
         Armed := True;
         Id := To_Unbounded_String (Entity_Id);
      end Arm;

      procedure Check (Target : String; Crash : out Boolean) is
      begin
         Crash := False;
         if Armed and then
           Ada.Strings.Fixed.Index
             (Target, "/" & To_String (Id) & "/current.json") > 0
         then
            --  one-shot: the armed crash fires on exactly one write
            Armed := False;
            Crash := True;
         end if;
      end Check;
   end Crash_Hook;

   Max_Import  : constant := 1_024 * 1_024;
   --  SC-A5: published service capability (contract/openapi.yaml
   --  ServiceCapabilities.maxBatchOperations): the campaign/batch planner is
   --  sized and bounded by this single constant.
   Max_Batch_Operations : constant := 50;
   type Level_Array is array (Positive range <>) of Unbounded_String;

   --  SC-A5: game settings are loaded once at startup (Configure), validated
   --  structurally against data/games/game-settings-schema.json and
   --  data/games/crew-settings-schema.json, and cached here.  Game() consults
   --  this cache first; the legacy disk read remains the fallback for stems
   --  that are not part of the validated set.  Every capability projection is
   --  computed from these cached values — no capability literal lives in the
   --  endpoint code.
   Max_Cached_Games : constant := 32;
   type Cached_Game is record
      Stem     : Unbounded_String := Null_Unbounded_String;
      Settings : JSON_Value := JSON_Null;
      Crew     : JSON_Value := JSON_Null;
   end record;
   Game_Cache : array (1 .. Max_Cached_Games) of Cached_Game :=
     (others => (Null_Unbounded_String, JSON_Null, JSON_Null));
   Game_Cache_Count : Natural := 0;

   function Trim_Image (N : Integer) return String is
     (Ada.Strings.Fixed.Trim (Integer'Image (N), Ada.Strings.Both));

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

   function Safe (Value : String) return Boolean is
   begin
      if Value'Length = 0 then return False; end if;
      for C of Value loop
         if not (C in 'A' .. 'Z' or else C in 'a' .. 'z'
                 or else C in '0' .. '9' or else C = '-')
         then return False; end if;
      end loop;
      return True;
   end Safe;

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

   function Now return String is
      S : constant String := Ada.Calendar.Formatting.Image
        (Ada.Calendar.Clock, Include_Time_Fraction => True);
      --  BUG-013: Ada.Calendar.Formatting.Image emits a single space between
      --  the date and the hour, but contract/schemas/common.json#/$defs/
      --  timestamp is RFC 3339 date-time (mandatory 'T').
      T : constant String := S (S'First .. S'First + 9)
        & "T" & S (S'First + 11 .. S'Last);
   begin
      return T & "Z";
   end Now;

   function New_Id return String is
      R : constant String := AWS.Utils.Random_String (32);
      function H (C : Character) return Character is
         V : constant Natural := Character'Pos (C) mod 16;
      begin
         return (if V < 10 then Character'Val (Character'Pos ('0') + V)
                 else Character'Val (Character'Pos ('a') + V - 10));
      end H;
      X : String (1 .. 32);
   begin
      for I in X'Range loop X (I) := H (R (I)); end loop;
      X (13) := '4';
      X (17) := '8';
      return X (1 .. 8) & "-" & X (9 .. 12) & "-" & X (13 .. 16) & "-"
        & X (17 .. 20) & "-" & X (21 .. 32);
   end New_Id;

   function Digits17 (N : Long_Long_Integer) return String is
      S : constant String := Long_Long_Integer'Image (N);
      T : String (1 .. 17) := (others => '0');
      J : Natural := 17;
   begin
      for I in reverse S'Range loop
         if S (I) in '0' .. '9' then
            T (J) := S (I);
            if J = 1 then exit; end if;
            J := J - 1;
         end if;
      end loop;
      return T;
   end Digits17;

   --  BUG-008: snapshot ids are "17 digits + '-' + random" per
   --  contract/openapi.yaml.  The zero-padded 17-digit prefix is monotonic
   --  (Snapshot_Clock), so lexicographic filename order equals creation
   --  order and both history listing and undo can rely on it.
   function New_Snapshot_Id return String is
      Prefix : Long_Long_Integer;
   begin
      Snapshot_Clock.Next (Prefix);
      return Digits17 (Prefix) & "-" & AWS.Utils.Random_String (32);
   end New_Snapshot_Id;

   --  SC-A2: opaque preview tokens (import/repair preview -> confirming
   --  apply).  Each token is bound to the route (kind/id), a SHA-256 of the
   --  exact previewed input (the submitted import entity, or the stored raw
   --  bytes for repair), the stored revision (or the sha256: content token
   --  for a degraded target) at preview time, and the previewed result.
   --  Tokens are single-use and expire after Preview_Token_Lifetime;
   --  staleness is detectable because the apply re-checks the bound input
   --  hash, revision, and content token against the current state and
   --  refuses with 409 STALE_REVISION when anything changed.
   Max_Preview_Tokens : constant := 64;
   Preview_Token_Lifetime : constant Duration := 30.0 * 60.0;
   type Preview_Token_Entry is record
      Token      : Unbounded_String := Null_Unbounded_String;
      Kind       : Unbounded_String := Null_Unbounded_String;
      Id         : Unbounded_String := Null_Unbounded_String;
      Input_Hash : Unbounded_String := Null_Unbounded_String;
      Revision   : Integer := -1;             --  stored revision at preview
      Content    : Unbounded_String := Null_Unbounded_String; --  sha256: token when degraded
      Doc        : JSON_Value := JSON_Null;   --  previewed normalized document
      Outcome    : Unbounded_String := Null_Unbounded_String;
      Needs      : JSON_Array := Empty_Array; --  needs-input pointers awaiting caller values
      Issues     : JSON_Array := Empty_Array; --  needs-input issue triples
      Changes    : JSON_Array := Empty_Array;
      Warnings   : JSON_Array := Empty_Array;
      Expires    : Ada.Calendar.Time;
      Used       : Boolean := False;
   end record;
   Preview_Token_Table : array (1 .. Max_Preview_Tokens) of Preview_Token_Entry :=
     (others => (Token => Null_Unbounded_String, Kind => Null_Unbounded_String,
                 Id => Null_Unbounded_String, Input_Hash => Null_Unbounded_String,
                 Revision => -1, Content => Null_Unbounded_String, Doc => JSON_Null,
                 Outcome => Null_Unbounded_String, Needs => Empty_Array,
                 Issues => Empty_Array, Changes => Empty_Array,
                 Warnings => Empty_Array, Expires => Ada.Calendar.Clock,
                 Used => False));

   protected Preview_Token_Store is
      procedure Issue
        (Kind, Id, Input_Hash : String; Revision : Integer; Content : String;
         Doc : JSON_Value; Outcome : String;
         Needs, Issues, Changes, Warnings : JSON_Array;
         Token : out Unbounded_String);
      procedure Redeem
        (Token : String; Found, Used : out Boolean; E : out Preview_Token_Entry);
   private
      procedure Evict_Expired;
   end Preview_Token_Store;

   protected body Preview_Token_Store is
      procedure Evict_Expired is
      begin
         for I in Preview_Token_Table'Range loop
            if Length (Preview_Token_Table (I).Token) > 0
              and then Preview_Token_Table (I).Expires < Ada.Calendar.Clock
            then
               Preview_Token_Table (I).Token := Null_Unbounded_String;
            end if;
         end loop;
      end Evict_Expired;

      procedure Issue
        (Kind, Id, Input_Hash : String; Revision : Integer; Content : String;
         Doc : JSON_Value; Outcome : String;
         Needs, Issues, Changes, Warnings : JSON_Array;
         Token : out Unbounded_String)
      is
         Slot : Natural := 0;
      begin
         Evict_Expired;
         for I in Preview_Token_Table'Range loop
            if Length (Preview_Token_Table (I).Token) = 0 then
               Slot := I;
               exit;
            end if;
         end loop;
         if Slot = 0 then
            --  bounded: evict the oldest live token
            Slot := Preview_Token_Table'First;
            for I in Preview_Token_Table'First + 1 .. Preview_Token_Table'Last loop
               if Preview_Token_Table (I).Expires < Preview_Token_Table (Slot).Expires then
                  Slot := I;
               end if;
            end loop;
         end if;
         Preview_Token_Table (Slot) :=
           (Token => To_Unbounded_String ("pt-" & New_Snapshot_Id),
            Kind => To_Unbounded_String (Kind),
            Id => To_Unbounded_String (Id),
            Input_Hash => To_Unbounded_String (Input_Hash),
            Revision => Revision,
            Content => To_Unbounded_String (Content),
            Doc => Clone (Doc),
            Outcome => To_Unbounded_String (Outcome),
            Needs => Needs, Issues => Issues,
            Changes => Changes, Warnings => Warnings,
            Expires => Ada.Calendar.Clock + Preview_Token_Lifetime,
            Used => False);
         Token := Preview_Token_Table (Slot).Token;
      end Issue;

      procedure Redeem
        (Token : String; Found, Used : out Boolean; E : out Preview_Token_Entry)
      is
      begin
         Found := False;
         Used := False;
         for I in Preview_Token_Table'Range loop
            if To_String (Preview_Token_Table (I).Token) = Token then
               Found := True;
               Used := Preview_Token_Table (I).Used;
               E := Preview_Token_Table (I);
               if not Used then
                  --  single-use: any redemption attempt consumes the token
                  Preview_Token_Table (I).Used := True;
               end if;
               return;
            end if;
         end loop;
      end Redeem;
   end Preview_Token_Store;

   function Read_File (Name : String) return String is
      F    : GNAT.OS_Lib.File_Descriptor := GNAT.OS_Lib.Open_Read (Name, GNAT.OS_Lib.Binary);
      Size : constant Long_Integer := GNAT.OS_Lib.File_Length (F);
   begin
      declare
         Text : String (1 .. Integer (Size));
         Last : Integer;
      begin
         Last := GNAT.OS_Lib.Read (F, Text'Address, Text'Length);
         GNAT.OS_Lib.Close (F);
         if Last /= Text'Length then raise Ada.Text_IO.End_Error; end if;
         return Text;
      end;
   end Read_File;

   function C_Fsync (Fd : Interfaces.C.int) return Interfaces.C.int;
   pragma Import (C, C_Fsync, "fsync");
   --  BUG-009 durability: neither GNAT.OS_Lib nor Ada.Directories exposes
   --  fsync(2) in this toolchain (GNAT 16), so POSIX fsync is bound directly
   --  to libc.  If fsync were ever unavailable, the fallback is: unique temp
   --  name, Set_Close_On_Exec, explicit close, rename — still atomic, but
   --  without the kernel durability barrier.

   procedure Atomic_Write (Name : String; Value : JSON_Value) is
      Counter : Natural;
      Dir     : constant String := Ada.Directories.Containing_Directory (Name);
      F       : GNAT.OS_Lib.File_Descriptor;
      Status  : Boolean;
      Renamed : Boolean;
   begin
      if not Ada.Directories.Exists (Dir) then Ada.Directories.Create_Path (Dir); end if;
      Temp_Counter.Next (Counter);
      declare
         Tmp  : constant String := Name & "." & Trim_Image (Counter) & ".tmp";
         Text : constant String := Write (Value, Compact => False) & ASCII.LF;
      begin
         F := GNAT.OS_Lib.Create_File (Tmp, GNAT.OS_Lib.Binary);
         if F = GNAT.OS_Lib.Invalid_FD then
            raise Ada.Text_IO.Device_Error with "cannot create temp file " & Tmp;
         end if;
         GNAT.OS_Lib.Set_Close_On_Exec (F, True, Status);
         declare
            Written : Integer;
            W       : Integer := 0;
            Crash_Now : Boolean;
         begin
            while W < Text'Length loop
               Written := GNAT.OS_Lib.Write
                 (F, Text (Text'First + W .. Text'Last)'Address, Text'Length - W);
               if Written <= 0 then
                  GNAT.OS_Lib.Close (F, Status);
                  raise Ada.Text_IO.Device_Error with "short write to " & Tmp;
               end if;
               W := W + Written;
               --  SC-A2: --test-hooks crash probe — abort mid-write (temp
               --  file removed, target untouched) when armed for this file.
               if W >= Text'Length / 2 then
                  Crash_Hook.Check (Name, Crash_Now);
                  if Crash_Now then
                     GNAT.OS_Lib.Close (F, Status);
                     GNAT.OS_Lib.Delete_File (Tmp, Status);
                     raise Ada.Text_IO.Device_Error with "crash-mid-write hook";
                  end if;
               end if;
            end loop;
         end;
         if C_Fsync (Interfaces.C.int (F)) /= 0 then
            GNAT.OS_Lib.Close (F, Status);
            GNAT.OS_Lib.Delete_File (Tmp, Status);
            raise Ada.Text_IO.Device_Error with "fsync failed for " & Tmp;
         end if;
         GNAT.OS_Lib.Close (F, Status);
         GNAT.OS_Lib.Rename_File (Tmp, Name, Renamed);
         if not Renamed then
            raise Ada.Text_IO.Device_Error with "atomic rename failed";
         end if;
         --  fsync the containing directory so the rename itself is durable
         declare
            Dir_Fd : constant GNAT.OS_Lib.File_Descriptor :=
              GNAT.OS_Lib.Open_Read (Dir, GNAT.OS_Lib.Binary);
         begin
            if Dir_Fd /= GNAT.OS_Lib.Invalid_FD then
               if C_Fsync (Interfaces.C.int (Dir_Fd)) = 0 then
                  null;
               end if;
               GNAT.OS_Lib.Close (Dir_Fd, Status);
            end if;
         end;
      end;
   end Atomic_Write;

   function Entity_Dir (Kind, Id : String) return String is
     (To_String (Data_Root) & "/" & Kind & "s/" & Id);
   function Current_File (Kind, Id : String) return String is
     (Entity_Dir (Kind, Id) & "/current.json");

   function Read_Entity (Kind, Id : String) return JSON_Value is
      Name : constant String := Current_File (Kind, Id);
   begin
      if not Ada.Directories.Exists (Name) then return JSON_Null; end if;
      declare V : constant JSON_Value := Read (Read_File (Name)); begin
         if Integer'(Get (V, "formatVersion")) /= 1 then return JSON_Null; end if;
         return V;
      end;
   end Read_Entity;

   --  SC-A1: exception-safe entity read for write paths.  Exists is False
   --  for a missing file; Parse_Ok is False when the bytes exist but do not
   --  parse as JSON (D10 unreadable).  No formatVersion filtering: the
   --  generated validator classifies a future-format document as degraded.
   procedure Try_Read_Entity
     (Kind, Id : String; V : out JSON_Value;
      Exists, Parse_Ok : out Boolean)
   is
      Name : constant String := Current_File (Kind, Id);
   begin
      V := JSON_Null; Exists := False; Parse_Ok := False;
      if not Ada.Directories.Exists (Name) then return; end if;
      Exists := True;
      V := Read (Read_File (Name));
      Parse_Ok := True;
   exception
      when others =>
         V := JSON_Null; Exists := True; Parse_Ok := False;
   end Try_Read_Entity;

   procedure Write_Entity (Kind, Id : String; Entity : JSON_Value) is
   begin
      Atomic_Write (Current_File (Kind, Id), Entity);
   end Write_Entity;

   --  SC-A3: route ids of every entity directory of a kind (Q15 — the
   --  directory location is authoritative, so degraded rows keep their
   --  route identity in every collection projection).  Every collection
   --  projection iterates route ids (SC-A4) so an unreadable member is
   --  listed, never dropped.
   function Entity_Ids (Kind : String) return JSON_Array is
      Base : constant String := To_String (Data_Root) & "/" & Kind & "s";
      Search : Ada.Directories.Search_Type;
      Dir_Item : Ada.Directories.Directory_Entry_Type;
      Out_A : JSON_Array := Empty_Array;
   begin
      if not Ada.Directories.Exists (Base) then return Out_A; end if;
      Ada.Directories.Start_Search
        (Search, Base, "*",
         (Ada.Directories.Directory => True, others => False));
      while Ada.Directories.More_Entries (Search) loop
         Ada.Directories.Get_Next_Entry (Search, Dir_Item);
         declare
            N : constant String := Ada.Directories.Simple_Name (Dir_Item);
         begin
            if N /= "." and then N /= ".." then
               Append (Out_A, Create (N));
            end if;
         end;
      end loop;
      Ada.Directories.End_Search (Search);
      return Out_A;
   end Entity_Ids;

   Max_History_Snapshots : constant := 50;

   --  BUG-008 retention: keep only the newest Max_History_Snapshots files.
   --  Snapshot filenames are "{17 digits}-{random}.json" and the monotonic
   --  17-digit prefix makes lexicographic filename order equal creation
   --  order, so a plain ascending sort identifies the oldest files.
   procedure Prune_History (Kind, Id : String) is
      Base   : constant String := Entity_Dir (Kind, Id) & "/history";
      type Name_List is array (1 .. 1_024) of Unbounded_String;
      Names  : Name_List := (others => Null_Unbounded_String);
      Count  : Natural := 0;
      Search : Ada.Directories.Search_Type;
      Item   : Ada.Directories.Directory_Entry_Type;
   begin
      if not Ada.Directories.Exists (Base) then return; end if;
      Ada.Directories.Start_Search
        (Search, Base, "*.json",
         (Ada.Directories.Ordinary_File => True, others => False));
      while Ada.Directories.More_Entries (Search) and then Count < Names'Last loop
         Ada.Directories.Get_Next_Entry (Search, Item);
         Count := Count + 1;
         Names (Count) := To_Unbounded_String (Ada.Directories.Simple_Name (Item));
      end loop;
      Ada.Directories.End_Search (Search);
      if Count <= Max_History_Snapshots then return; end if;
      for I in 1 .. Count - 1 loop
         for J in I + 1 .. Count loop
            if To_String (Names (J)) < To_String (Names (I)) then
               declare
                  Tmp : constant Unbounded_String := Names (I);
               begin
                  Names (I) := Names (J);
                  Names (J) := Tmp;
               end;
            end if;
         end loop;
      end loop;
      for I in 1 .. Count - Max_History_Snapshots loop
         declare
            N : constant String := Base & "/" & To_String (Names (I));
         begin
            if Ada.Directories.Exists (N) then Ada.Directories.Delete_File (N); end if;
         end;
      end loop;
   end Prune_History;

   procedure Snapshot (Kind, Id, Op : String; Entity : JSON_Value) is
      H   : JSON_Value := Create_Object;
      M   : JSON_Value := Create_Object;
      Sid : constant String := New_Snapshot_Id;
      Hist : constant String := Entity_Dir (Kind, Id) & "/history";
   begin
      Set_Field (M, "snapshotId", Sid);
      Set_Field (M, "takenAt", Now);
      Set_Field (M, "op", Op);
      Set_Field (H, "_snapshot", M);
      Set_Field (H, "entity", Clone (Entity));
      Atomic_Write (Hist & "/" & Sid & ".json", H);
      Prune_History (Kind, Id);
      --  OPT-002: append the compact header to the sidecar index (newest
      --  first) so History can avoid re-reading full snapshot bodies.
      declare
         Sidecar : constant String := Hist & "/_index.json";
         Entries : JSON_Array := Empty_Array;
      begin
         if Ada.Directories.Exists (Sidecar) then
            begin
               declare V : constant JSON_Value := Read (Read_File (Sidecar)); begin
                  if Has_Field (V, "entries") then Entries := Get (V, "entries"); end if;
               end;
            exception
               when others => Entries := Empty_Array;
            end;
         end if;
         declare
            N : JSON_Value := Create_Object;
            L : Natural := Length (Entries);
         begin
            Set_Field (N, "snapshotId", Sid);
            Set_Field (N, "takenAt", Now);
            Set_Field (N, "op", Op);
            --  cap at Max_History_Snapshots (prune keeps the newest files)
            if L >= Max_History_Snapshots then L := Max_History_Snapshots - 1; end if;
            declare
               New_A : JSON_Array := Empty_Array;
            begin
               Append (New_A, N);
               for I in 1 .. L loop
                  Append (New_A, Get (Entries, I));
               end loop;
               declare X : JSON_Value := Create_Object; begin
                  Set_Field (X, "entries", New_A);
                  Atomic_Write (Sidecar, X);
               end;
            end;
         end;
      end;
   end Snapshot;

   --  BUG-008: history is returned NEWEST FIRST.  Files are sorted by name
   --  (17-digit prefix => creation order) and emitted in reverse, so
   --  history[0] is always the most recent snapshot regardless of
   --  filesystem enumeration order.
   --  OPT-002: rebuild the sidecar index from the snapshot files on disk
   --  (used after undo deletes a snapshot; keeps History consistent).
   procedure Rebuild_Index (Kind, Id : String) is
      Base : constant String := Entity_Dir (Kind, Id) & "/history";
      type Name_List is array (1 .. 1_024) of Unbounded_String;
      Names  : Name_List := (others => Null_Unbounded_String);
      Count  : Natural := 0;
      Search : Ada.Directories.Search_Type;
      Item   : Ada.Directories.Directory_Entry_Type;
   begin
      if not Ada.Directories.Exists (Base) then return; end if;
      Ada.Directories.Start_Search
        (Search, Base, "*.json",
         (Ada.Directories.Ordinary_File => True, others => False));
      while Ada.Directories.More_Entries (Search) and then Count < Names'Last loop
         Ada.Directories.Get_Next_Entry (Search, Item);
         if Ada.Directories.Simple_Name (Item) /= "_index.json" then
            Count := Count + 1;
            Names (Count) := To_Unbounded_String (Ada.Directories.Simple_Name (Item));
         end if;
      end loop;
      Ada.Directories.End_Search (Search);
      for I in 1 .. Count - 1 loop
         for J in I + 1 .. Count loop
            if To_String (Names (J)) < To_String (Names (I)) then
               declare Tmp : constant Unbounded_String := Names (I); begin
                  Names (I) := Names (J); Names (J) := Tmp;
               end;
            end if;
         end loop;
      end loop;
      declare
         New_A : JSON_Array := Empty_Array;
      begin
         for I in reverse 1 .. Count loop
            declare
               V : constant JSON_Value :=
                 Read (Read_File (Base & "/" & To_String (Names (I))));
            begin
               Append (New_A, Get (V, "_snapshot"));
            end;
         end loop;
         declare X : JSON_Value := Create_Object; begin
            Set_Field (X, "entries", New_A);
            Atomic_Write (Base & "/_index.json", X);
         end;
      end;
   end Rebuild_Index;

   --  OPT-002: GET history previously read and parsed the FULL entity clone
   --  from every snapshot file just to return the 3-field _snapshot header
   --  (measured 31-80x byte amplification).  Each Snapshot now also appends
   --  the compact header to a sidecar _index.json; History reads that one
   --  small file when present and falls back to the per-file scan only when
   --  the sidecar is missing or corrupt.
   function History (Kind, Id : String) return JSON_Array is
      Base : constant String := Entity_Dir (Kind, Id) & "/history";
      O    : JSON_Array := Empty_Array;
   begin
      if not Ada.Directories.Exists (Base) then return O; end if;
      declare
         Sidecar : constant String := Base & "/_index.json";
      begin
         if Ada.Directories.Exists (Sidecar) then
            begin
               declare V : constant JSON_Value := Read (Read_File (Sidecar)); begin
                  if Has_Field (V, "entries") then
                     declare E : constant JSON_Array := Get (V, "entries"); begin
                        --  sidecar stores newest-first
                        for I in 1 .. Length (E) loop
                           Append (O, Get (E, I));
                        end loop;
                        return O;
                     end;
                  end if;
               end;
            exception
               when others => null;  --  corrupt sidecar: fall through to scan
            end;
         end if;
      end;
      declare
         type Name_List is array (1 .. 1_024) of Unbounded_String;
         Names  : Name_List := (others => Null_Unbounded_String);
         Count  : Natural := 0;
         Search : Ada.Directories.Search_Type;
         Item   : Ada.Directories.Directory_Entry_Type;
      begin
         Ada.Directories.Start_Search
           (Search, Base, "*.json",
            (Ada.Directories.Ordinary_File => True, others => False));
         while Ada.Directories.More_Entries (Search) and then Count < Names'Last loop
            Ada.Directories.Get_Next_Entry (Search, Item);
            if Ada.Directories.Simple_Name (Item) /= "_index.json" then
               Count := Count + 1;
               Names (Count) := To_Unbounded_String (Ada.Directories.Simple_Name (Item));
            end if;
         end loop;
         Ada.Directories.End_Search (Search);
         for I in 1 .. Count - 1 loop
            for J in I + 1 .. Count loop
               if To_String (Names (J)) < To_String (Names (I)) then
                  declare
                     Tmp : constant Unbounded_String := Names (I);
                  begin
                     Names (I) := Names (J);
                     Names (J) := Tmp;
                  end;
               end if;
            end loop;
         end loop;
         for I in reverse 1 .. Count loop
            declare
               V : constant JSON_Value :=
                 Read (Read_File (Base & "/" & To_String (Names (I))));
            begin
               Append (O, Get (V, "_snapshot"));
            end;
         end loop;
      end;
      return O;
   end History;

   function Empty_Object return JSON_Value is (Create_Object);
   function Empty_List return JSON_Value is (Create (Empty_Array));
   function Str_Field (V : JSON_Value; Name : String; Default : String := "") return String;

   --  SC-A3: one root-pointer issue for transport/request-level failures.
   function Root_Issues (Message : String) return JSON_Array is
      A : JSON_Array := Empty_Array;
   begin
      Append (A, Issue_At ("", Message, "a schema-valid request"));
      return A;
   end Root_Issues;

   --  SC-A3: typed error envelope helper.  Every code maps to its frozen
   --  union branch; codes whose branch needs numeric details (limit/funds/
   --  stale) are constructed by their dedicated builders at the call sites,
   --  never through this fallback.
   function Error_Result
     (Op, Code, Message : String; Entity : JSON_Value := JSON_Null)
      return JSON_Value
   is
   begin
      if Code = "NOT_FOUND" then
         return Not_Found_Error (Op, Message, Entity);
      elsif Code = "STALE_REVISION" then
         return Stale_Error
           (Op, Entity,
            (if Entity.Kind = JSON_Object_Type and then Has_Field (Entity, "revision")
               and then Get (Entity, "revision").Kind = JSON_Int_Type
             then Get (Get (Entity, "revision")) else -1));
      elsif Code = "INVALID_ENTITY" then
         return Invalid_Entity_Error (Op, Root_Issues (Message));
      elsif Code = "INVALID_ENTRY" then
         return Invalid_Entry_Error (Op, Root_Issues (Message));
      elsif Code = "RETIRED" then
         return Retired_Error (Op, Message, Entity);
      elsif Code = "CONFIRM_REQUIRED" then
         return Confirm_Required_Error (Op, Message, Entity);
      elsif Code = "DUPLICATE" then
         return Duplicate_Error (Op, Message, Entity);
      elsif Code = "SLOT_FULL_FATAL" then
         return Slot_Full_Fatal_Error (Op, Message, Entity);
      elsif Code = "ARMOR_NOT_AVAILABLE" then
         return Armor_Not_Available_Error (Op, Message, Entity);
      elsif Code = "NO_COMMITMENT" then
         return No_Commitment_Error (Op, Message, Entity);
      elsif Code = "COMMITMENT_LOCKED" then
         return Commitment_Locked_Error (Op, Message, Entity);
      elsif Code = "NO_HISTORY" then
         return No_History_Error (Op, Message, Entity);
      elsif Code = "GAME_NOT_FOUND" then
         return Game_Not_Found_Error (Op, Message);
      elsif Code = "PAYLOAD_TOO_LARGE" then
         return Payload_Too_Large_Error (Op, Message, Integer (Max_Import), 0);
      end if;
      --  every remaining code is the VALIDATION branch (pointer details)
      return Validation_Error (Op, Message, Root_Issues (Message), Entity);
   end Error_Result;

   function Success_Result
     (Op : String; Entity : JSON_Value; Requested : Integer := Integer'First;
      Effective : Integer := Integer'First; Landed : String := "";
      Side : String := "") return JSON_Value
   is
      R : JSON_Value := Create_Object;
      A : JSON_Value := Create_Object;
      S : JSON_Array := Empty_Array;
   begin
      Set_Field (A, "op", Op);
      if Requested /= Integer'First then Set_Field (A, "requested", Requested); end if;
      if Effective /= Integer'First then Set_Field (A, "effective", Effective); end if;
      if Landed /= "" then Set_Field (A, "landedIntensity", Landed); end if;
      if Side /= "" then Append (S, Create (Side)); end if;
      Set_Field (R, "ok", True); Set_Field (R, "applied", A);
      Set_Field (R, "sideEffects", S); Set_Field (R, "error", JSON_Null);
      --  SC-A4: degraded (unreadable) entities have no readable DTO — the
      --  envelope is emitted without an entity member (the frozen decoder
      --  keeps entity fields optional).
      if Entity.Kind = JSON_Object_Type then
         Set_Field (R, Str_Field (Entity, "kind"), Entity);
      end if;
      return R;
   end Success_Result;

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

   --  SC-A2: frozen whole-error union builders (contract/schemas/
   --  operation-result.json $defs/operationError).  Every branch carries
   --  code, status, message, retryable, recovery, and typed details;
   --  NORMALIZATION_REQUIRED additionally carries the preview member and
   --  the token (same value as details.previewToken).
   function Preview_Result_Value
     (Changes, Warnings, Needs : JSON_Array; Canonical : Boolean;
      Doc : JSON_Value; Token : String := "") return JSON_Value
   is
      R : JSON_Value := Create_Object;
   begin
      Set_Field (R, "changes", Changes);
      Set_Field (R, "document", Clone (Doc));
      Set_Field (R, "warnings", Warnings);
      if Length (Needs) > 0 then Set_Field (R, "needsInputPointers", Needs); end if;
      if Token /= "" then Set_Field (R, "previewToken", Token); end if;
      Set_Field (R, "canonical", Canonical);
      return R;
   end Preview_Result_Value;

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

   function Int_Field (V : JSON_Value; Name : String; Default : Integer := 0) return Integer is
     (if V.Kind = JSON_Object_Type and then Has_Field (V, Name)
      and then Get (V, Name).Kind = JSON_Int_Type then Get (V, Name) else Default);
   function Str_Field (V : JSON_Value; Name : String; Default : String := "") return String is
     (if V.Kind = JSON_Object_Type and then Has_Field (V, Name)
      and then Get (V, Name).Kind = JSON_String_Type then Get (V, Name) else Default);
   function Bool_Field (V : JSON_Value; Name : String; Default : Boolean := False) return Boolean is
     (if V.Kind = JSON_Object_Type and then Has_Field (V, Name)
      and then Get (V, Name).Kind = JSON_Boolean_Type then Get (V, Name) else Default);
   function Array_Length (V : JSON_Value; Name : String) return Natural is
      A : constant JSON_Array := Get (V, Name);
   begin return Length (A); end Array_Length;

   --  BUG-008: x-snapshot flags mirror contract/openapi.yaml.  Only ops
   --  declared snapshot-worthy get a history entry; everything else (and any
   --  unknown op) returns False — e.g. stress.clear, armor.set,
   --  harm.healing-clock, clock.progress/reset, gear.lock/unlock/
   --  set-commitment/commit/uncommit, notebook.set, session.set.
   function Snapshots (Op : String) return Boolean is
   begin
      if Op = "stress.add" or else Op = "trauma.add" or else Op = "trauma.remove"
        or else Op = "harm.add" or else Op = "harm.remove" or else Op = "harm.heal"
        or else Op = "playbook-xp.add" or else Op = "playbook-xp.clear"
        or else Op = "action.set-rating"
        or else Op = "attribute-xp.add" or else Op = "attribute-xp.clear"
        or else Op = "attribute.levelup"
        or else Op = "ability.take" or else Op = "ability.remove"
        or else Op = "fund.gain" or else Op = "fund.spend" or else Op = "fund.liquidate"
        or else Op = "rolodex.add" or else Op = "rolodex.remove"
        or else Op = "rolodex.set-closeness"
        or else Op = "dossier.update"
        or else Op = "note.add" or else Op = "note.remove"
        or else Op = "heat.add" or else Op = "wanted.add" or else Op = "rep.add"
        or else Op = "coin.add" or else Op = "stash.add" or else Op = "tier.add"
        or else Op = "turf.add" or else Op = "xp.add" or else Op = "xp.clear"
        or else Op = "gear.add" or else Op = "gear.remove"
        or else Op = "gear.clear-commitments"
        or else Op = "hold.set"
        or else Op = "cohort.add" or else Op = "cohort.remove"
        or else Op = "cohort.update"
        or else Op = "upgrade.mark" or else Op = "upgrade.unmark"
        or else Op = "fields.update"
        or else Op = "contact.add" or else Op = "contact.remove"
        or else Op = "faction.set-status" or else Op = "faction.remove"
        or else Op = "end-score" or else Op = "end-downtime"
        or else Op = "retire"
        or else Op = "claim.set" or else Op = "claim.customize"
        or else Op = "claim.reset"
      then
         return True;
      end if;
      return False;
   end Snapshots;

   --  SC-A1: the generated recursive validator (Pitd_Schema_Validators,
   --  emitted from contract/schemas/*.json by the SC-C5 generator) replaces
   --  the hand-maintained top-level required/allow lists (the SC-R1
   --  anti-pattern).  The SC-R1 emission shape keeps one shared error list
   --  in package state, while AWS serves requests from a concurrent task
   --  pool — every validator access is therefore serialized through this
   --  protected gate (the document itself is a pure input; serialization
   --  only protects the shared accumulator).
   function Expected_For (Reason : String) return String is
   begin
      if Ada.Strings.Fixed.Index (Reason, "missing required property") > 0 then
         return "the property must be present with a schema-valid value";
      elsif Ada.Strings.Fixed.Index (Reason, "unknown property") > 0 then
         return "only properties declared in the schema";
      elsif Ada.Strings.Fixed.Index (Reason, "pattern:") > 0 then
         return "a value matching the declared pattern";
      elsif Ada.Strings.Fixed.Index (Reason, "range:") > 0 then
         return "a value within the declared bounds";
      elsif Ada.Strings.Fixed.Index (Reason, "enum:") > 0 then
         return "one of the declared enum values";
      elsif Ada.Strings.Fixed.Index (Reason, "minLength:") > 0 then
         return "a string of at least the declared length";
      elsif Ada.Strings.Fixed.Index (Reason, "const:") > 0 then
         return "the declared constant";
      elsif Ada.Strings.Fixed.Index (Reason, "uniqueItems:") > 0 then
         return "no duplicate items";
      elsif Ada.Strings.Fixed.Index (Reason, "x-segmentsLeSize:") > 0 then
         return "segments not exceeding size";
      end if;
      return "a schema-valid value";
   end Expected_For;

   protected Validator_Gate is
      --  Validate V; Ok is True when the document is schema-valid.
      procedure Check (Kind : String; V : JSON_Value; Ok : out Boolean);
      --  Validate V and collect the pointer-level schema issues
      --  (frozen errorIssue shape); atomically captured with the run.
      procedure Collect (Kind : String; V : JSON_Value; Issues : out JSON_Array);
   private
      procedure Dispatch (Kind : String; V : JSON_Value);
   end Validator_Gate;

   protected body Validator_Gate is
      procedure Dispatch (Kind : String; V : JSON_Value) is
      begin
         Pitd_Schema_Validators.Reset;
         if Kind = "character" then
            Pitd_Schema_Validators.Validate_Character (V);
         elsif Kind = "crew" then
            Pitd_Schema_Validators.Validate_Crew (V);
         elsif Kind = "clock" then
            Pitd_Schema_Validators.Validate_Clock (V);
         end if;
      end Dispatch;

      procedure Check (Kind : String; V : JSON_Value; Ok : out Boolean) is
      begin
         Dispatch (Kind, V);
         Ok := Pitd_Schema_Validators.Valid;
      end Check;

      procedure Collect (Kind : String; V : JSON_Value; Issues : out JSON_Array) is
      begin
         Dispatch (Kind, V);
         Issues := Empty_Array;
         for I in 1 .. Pitd_Schema_Validators.N_Errors loop
            declare X : JSON_Value := Create_Object; begin
               Set_Field (X, "pointer", Pitd_Schema_Validators.Pointer (I));
               Set_Field (X, "reason", Pitd_Schema_Validators.Reason (I));
               Set_Field (X, "expected", Expected_For (Pitd_Schema_Validators.Reason (I)));
               Append (Issues, X);
            end;
         end loop;
      end Collect;
   end Validator_Gate;

   --  True when the document validates against the generated schema
   --  validator AND matches the route identity (Q15: the route is
   --  authoritative; a stored body whose kind/id contradicts its directory
   --  location is a D8 identity defect, never silently accepted).
   function Entity_Is_Canonical (Kind, Id : String; V : JSON_Value) return Boolean is
      Ok : Boolean;
   begin
      if V.Kind /= JSON_Object_Type then return False; end if;
      if Str_Field (V, "kind") /= Kind or else Str_Field (V, "id") /= Id then
         return False;
      end if;
      Validator_Gate.Check (Kind, V, Ok);
      return Ok;
   end Entity_Is_Canonical;

   --  Compact human expectation for a generated-validator reason, for the
   --  frozen errorIssue {pointer, reason, expected} triples.


   --  Pointer-level admission issues (frozen errorIssue shape) for the
   --  current validator error set; identity defects are prepended when the
   --  body contradicts the route.
   function Validation_Issues (Kind, Id : String; V : JSON_Value) return JSON_Array is
      Out_A : JSON_Array := Empty_Array;
   begin
      if V.Kind = JSON_Object_Type then
         if Str_Field (V, "kind") /= Kind then
            declare
               X : JSON_Value := Create_Object;
            begin
               Set_Field (X, "pointer", "/kind");
               Set_Field (X, "reason",
                          "identity: body kind " & Str_Field (V, "kind")
                          & " does not match route " & Kind
                          & " (directory is authoritative)");
               Set_Field (X, "expected", "kind " & Kind);
               Append (Out_A, X);
            end;
         end if;
         if Str_Field (V, "id") /= Id then
            declare
               X : JSON_Value := Create_Object;
            begin
               Set_Field (X, "pointer", "/id");
               Set_Field (X, "reason",
                          "identity: body id does not match route "
                          & Id & " (directory is authoritative)");
               Set_Field (X, "expected", "id " & Id);
               Append (Out_A, X);
            end;
         end if;
      end if;
      Validator_Gate.Collect (Kind, V, Out_A);
      return Out_A;
   end Validation_Issues;

   --  Frozen INVALID_ENTITY result body: ok:false with the typed error
   --  union variant {code, status: 422, message, retryable, recovery,
   --  details.issues} (operation-result.json $defs/operationError).
   function Invalid_Entity_Result (Op : String; Issues : JSON_Array) return JSON_Value is
     (Invalid_Entity_Error (Op, Issues));

   --  One frozen errorIssue record.
   function Issue_At (Pointer, Reason, Expected : String) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      Set_Field (X, "pointer", Pointer);
      Set_Field (X, "reason", Reason);
      Set_Field (X, "expected", Expected);
      return X;
   end Issue_At;

   --  SC-A3: pointer-level admission issues for a non-canonical stored
   --  document: the normalizer's needs-input issues first, then one issue
   --  per change-list entry whose pointer is not already reported (the
   --  change's replacement, rendered compactly, is the "expected" value).
   --  When the normalizer considers the document canonical but the
   --  generated validator rejects it, the validator's pointer-level issues
   --  are reported instead.
   function Admission_Issues
     (Kind, Id : String; E : JSON_Value; Ctx : JSON_Value) return JSON_Array
   is
      Out_A : JSON_Array := Empty_Array;
      Iss   : constant JSON_Array := Get (Ctx, "issues");
      Ch    : constant JSON_Array := Get (Ctx, "changes");
   begin
      for I in 1 .. Length (Iss) loop
         Append (Out_A, Get (Iss, I));
      end loop;
      for I in 1 .. Length (Ch) loop
         declare
            X   : constant JSON_Value := Get (Ch, I);
            Ptr : constant String := Str_Field (X, "pointer");
            Dup : Boolean := False;
         begin
            for J in 1 .. Length (Out_A) loop
               if Str_Field (Get (Out_A, J), "pointer") = Ptr then
                  Dup := True; exit;
               end if;
            end loop;
            if not Dup then
               Append (Out_A, Issue_At
                         (Ptr, Str_Field (X, "reason"),
                          String'(Write (Get (X, "replacement"), Compact => True))));
            end if;
         end;
      end loop;
      if Length (Out_A) = 0 then
         Out_A := Validation_Issues (Kind, Id, E);
      end if;
      return Out_A;
   end Admission_Issues;

   --  SC-A3: the ONE stored-entity classification path (R0 matrix — the
   --  four normalizer outcomes: canonical / repairable / needs-input /
   --  unreadable).  Direct GET, history reads, mutations, batch,
   --  capabilities, and collection projection all share this function.
   --  E is the raw parsed entity (JSON_Null for unreadable), Ctx the
   --  normalizer context, Issues the pointer-level admission details, and
   --  Canonical whether the stored bytes admit without repair.  Purely
   --  read-only: never writes, never repairs.
   procedure Classify_Stored
     (Kind, Id : String; Bytes : String;
      E : out JSON_Value; Ctx : out JSON_Value;
      Issues : out JSON_Array; Canonical : out Boolean)
   is
   begin
      E := JSON_Null;
      Ctx := Canonicalize (Kind, Id, Bytes);
      if Str_Field (Ctx, "outcome") = "unreadable" then
         Issues := Get (Ctx, "issues");
         Canonical := False;
         return;
      end if;
      begin
         E := Read (Bytes);
      exception
         when others =>
            Issues := Get (Ctx, "issues");
            Canonical := False;
            return;
      end;
      --  canonical per the normalizer AND the generated validator (the
      --  validator catches what the normalizer leaves to the schema, e.g.
      --  settings-bound violations the canonicalizer does not rewrite).
      Canonical := Bool_Field (Ctx, "canonical")
        and then Entity_Is_Canonical (Kind, Id, E);
      if Canonical then
         Issues := Empty_Array;
      else
         Issues := Admission_Issues (Kind, Id, E, Ctx);
      end if;
   end Classify_Stored;

   procedure Core_Clamp_Add
     (Current, Maximum, Amount : Natural; New_Value, Applied : out Natural)
   is
      use Paperclips_Core;
      use Paperclips_Core.Bounded_Integers;
      Item : Bounded_Integer := Create (Capacity (Maximum), Current);
   begin
      Add (Item, Amount, Applied); New_Value := Value (Item);
   end Core_Clamp_Add;

   procedure Core_Clamp_Subtract
     (Current, Maximum, Amount : Natural; New_Value, Applied : out Natural)
   is
      use Paperclips_Core;
      use Paperclips_Core.Bounded_Integers;
      Item : Bounded_Integer := Create (Capacity (Maximum), Current);
   begin
      Subtract (Item, Amount, Applied); New_Value := Value (Item);
   end Core_Clamp_Subtract;

   function Game (Stem : String) return JSON_Value is
   begin
      --  SC-A5: validated settings are cached at startup; a game listed in
      --  games.json (or its "-crews" catalog) is served from the cache.
      for I in 1 .. Game_Cache_Count loop
         if To_String (Game_Cache (I).Stem) = Stem then
            return Game_Cache (I).Settings;
         end if;
      end loop;
      --  legacy fallback for stems outside the validated set (unknown stems
      --  keep the historical permissive JSON_Null behavior)
      declare
         Name : constant String := To_String (Games_Root) & "/" & Stem & ".json";
      begin
         if not Safe (Stem) or else not Ada.Directories.Exists (Name) then return JSON_Null; end if;
         return Read (Read_File (Name));
      end;
   end Game;

   --  A8: ability.take is validated against the playbook/crew-type
   --  SpecialAbilities game data (TimesTakeable).  Unknown ability or
   --  missing game data keeps the historical permissive behavior.
   function Can_Take_More (Kind, Name : String; E : JSON_Value; Times_Taken : Integer) return Boolean is
      Group : constant String := (if Kind = "crew" then "CrewTypes" else "Playbooks");
      Type_Name : constant String :=
        (if Kind = "crew" then Str_Field (E, "crewTypeName")
         else Str_Field (Get (E, "playbook"), "name"));
      G : constant JSON_Value :=
        Game (Str_Field (E, "gameStem") & (if Kind = "crew" then "-crews" else ""));
   begin
      if G.Kind /= JSON_Object_Type or else not Has_Field (G, Group) then return True; end if;
      declare
         Types : constant JSON_Array := Get (G, Group);
      begin
         for I in 1 .. Length (Types) loop
            declare T : constant JSON_Value := Get (Types, I); begin
               if Str_Field (T, "Name") = Type_Name and then Has_Field (T, "SpecialAbilities") then
                  declare
                     Ab : constant JSON_Array := Get (T, "SpecialAbilities");
                  begin
                     for J in 1 .. Length (Ab) loop
                        if Str_Field (Get (Ab, J), "Name") = Name then
                           return Times_Taken < Int_Field (Get (Ab, J), "TimesTakeable", Integer'Last);
                        end if;
                     end loop;
                  end;
               end if;
            end;
         end loop;
      end;
      return True;
   end Can_Take_More;

   --  SC-A3: the ability's take limit (TimesTakeable from game data) for
   --  the frozen ABILITY_MAXED limit details; missing game data keeps the
   --  historical permissive behavior (no limit).
   function Ability_Take_Limit (Kind, Name : String; E : JSON_Value) return Integer is
      Group : constant String := (if Kind = "crew" then "CrewTypes" else "Playbooks");
      Type_Name : constant String :=
        (if Kind = "crew" then Str_Field (E, "crewTypeName")
         else Str_Field (Get (E, "playbook"), "name"));
      G : constant JSON_Value :=
        Game (Str_Field (E, "gameStem") & (if Kind = "crew" then "-crews" else ""));
   begin
      if G.Kind /= JSON_Object_Type or else not Has_Field (G, Group) then return Integer'Last; end if;
      declare
         Types : constant JSON_Array := Get (G, Group);
      begin
         for I in 1 .. Length (Types) loop
            declare T : constant JSON_Value := Get (Types, I); begin
               if Str_Field (T, "Name") = Type_Name and then Has_Field (T, "SpecialAbilities") then
                  declare
                     Ab : constant JSON_Array := Get (T, "SpecialAbilities");
                  begin
                     for J in 1 .. Length (Ab) loop
                        if Str_Field (Get (Ab, J), "Name") = Name then
                           return Int_Field (Get (Ab, J), "TimesTakeable", Integer'Last);
                        end if;
                     end loop;
                  end;
               end if;
            end;
         end loop;
      end;
      return Integer'Last;
   end Ability_Take_Limit;

   --  SC-A3: the crew upgrade's TotalBoxes from game data for the frozen
   --  UPGRADE_MAXED limit details; missing game data falls back to 4.
   function Upgrade_Total_Boxes (E : JSON_Value; Name : String) return Integer is
      G : constant JSON_Value := Game (Str_Field (E, "gameStem") & "-crews");
   begin
      if G.Kind = JSON_Object_Type and then Has_Field (G, "CrewTypes") then
         declare
            Types : constant JSON_Array := Get (G, "CrewTypes");
         begin
            for I in 1 .. Length (Types) loop
               declare T : constant JSON_Value := Get (Types, I); begin
                  if Has_Field (T, "Upgrades") then
                     declare
                        Ups : constant JSON_Array := Get (T, "Upgrades");
                     begin
                        for J in 1 .. Length (Ups) loop
                           if Str_Field (Get (Ups, J), "Name") = Name then
                              return Int_Field (Get (Ups, J), "TotalBoxes", 4);
                           end if;
                        end loop;
                     end;
                  end if;
               end;
            end loop;
         end;
      end if;
      return 4;
   end Upgrade_Total_Boxes;


   --  BUG-006: armor availability is DERIVED from the committed loadout and
   --  ability descriptions (authoritative C# CharacterArmor.cs), never a
   --  hardcoded creation default.  Standard: loadout contains "Armor"
   --  (or a localized variant); heavy: "+Heavy" (Blades) or any armor for
   --  other games; special: an ability description embedding "special armor".
   function Armor_Available (E : JSON_Value; Which : String) return Boolean is
      G   : constant JSON_Value := Get (E, "gear");
      L   : constant JSON_Array := Get (G, "loadout");
      P   : constant JSON_Value := Get (E, "playbook");
   begin
      if Which = "standard" then
         for I in 1 .. Length (L) loop
            declare N : constant String := Str_Field (Get (L, I), "name"); begin
               if N = "Armor" or else N = "Armure" or else N = "Доспех" then
                  return True;
               end if;
            end;
         end loop;
         return False;
      elsif Which = "heavy" then
         if Str_Field (E, "gameStem") = "blades-in-the-dark" then
            for I in 1 .. Length (L) loop
               declare N : constant String := Str_Field (Get (L, I), "name"); begin
                  if N = "+Heavy" or else N = "+Lourde" or else N = "+Тяжёлый" then
                     return True;
                  end if;
               end;
            end loop;
            return False;
         else
            return Armor_Available (E, "standard");
         end if;
      elsif Which = "special" then
         declare
            A : constant JSON_Array :=
              (if Has_Field (P, "abilities") then Get (P, "abilities")
               else Empty_Array);
         begin
            for I in 1 .. Length (A) loop
               declare D : constant String := Str_Field (Get (A, I), "description"); begin
                  if Ada.Strings.Fixed.Index (D, "special armor") > 0
                    or else Ada.Strings.Fixed.Index (D, "armure spéciale") > 0
                    or else Ada.Strings.Fixed.Index (D, "особая защита") > 0
                  then
                     return True;
                  end if;
               end;
            end loop;
         end;
         return False;
      end if;
      return False;
   end Armor_Available;

   --  A13: description for an ability from game data (used on new append).
   --  Character: Game(stem) Playbooks[].SpecialAbilities[].Description where
   --  Name matches; crew: Game(stem & "-crews") CrewTypes[].SpecialAbilities[].
   --  Missing game data / unknown ability keeps the historical empty string.
   function Ability_Description (Kind, Name : String; E : JSON_Value) return String is
      Group : constant String := (if Kind = "crew" then "CrewTypes" else "Playbooks");
      Type_Name : constant String :=
        (if Kind = "crew" then Str_Field (E, "crewTypeName")
         else Str_Field (Get (E, "playbook"), "name"));
      G : constant JSON_Value :=
        Game (Str_Field (E, "gameStem") & (if Kind = "crew" then "-crews" else ""));
   begin
      if G.Kind /= JSON_Object_Type or else not Has_Field (G, Group) then return ""; end if;
      declare
         Types : constant JSON_Array := Get (G, Group);
      begin
         for I in 1 .. Length (Types) loop
            declare T : constant JSON_Value := Get (Types, I); begin
               if Str_Field (T, "Name") = Type_Name and then Has_Field (T, "SpecialAbilities") then
                  declare
                     Ab : constant JSON_Array := Get (T, "SpecialAbilities");
                  begin
                     for J in 1 .. Length (Ab) loop
                        if Str_Field (Get (Ab, J), "Name") = Name then
                           return Str_Field (Get (Ab, J), "Description");
                        end if;
                     end loop;
                  end;
               end if;
            end;
         end loop;
      end;
      return "";
   end Ability_Description;

   --  A13c: Mastery-gated cap for action ratings.  The cap is 4 when the
   --  character's crew has the Mastery upgrade fully marked (boxesMarked >=
   --  TotalBoxes); otherwise 3.  TotalBoxes comes from the crew-type game
   --  data (Game(stem & "-crews") CrewTypes[].Upgrades[] where Name="Mastery"),
   --  falling back to 4 when the game data lookup fails.  Characters with no
   --  crew (or an unreadable crew) cap at 3.
   function Rating_Cap (E : JSON_Value) return Integer is
      Crew_Id : constant String := Str_Field (Get (E, "dossier"), "crewId");
   begin
      if Crew_Id = "" then return 3; end if;
      declare
         Crew : constant JSON_Value := Read_Entity ("crew", Crew_Id);
      begin
         if Crew.Kind /= JSON_Object_Type then return 3; end if;
         declare
            G : constant JSON_Value := Game (Str_Field (Crew, "gameStem") & "-crews");
            Marked : Integer := 0; Total : Integer := 4;
         begin
            if G.Kind = JSON_Object_Type and then Has_Field (G, "CrewTypes") then
               declare Types : constant JSON_Array := Get (G, "CrewTypes"); begin
                  for I in 1 .. Length (Types) loop
                     declare T : constant JSON_Value := Get (Types, I); begin
                        if Str_Field (T, "Name") = Str_Field (Crew, "crewTypeName")
                          and then Has_Field (T, "Upgrades") then
                           declare Up : constant JSON_Array := Get (T, "Upgrades"); begin
                              for J in 1 .. Length (Up) loop
                                 if Str_Field (Get (Up, J), "Name") = "Mastery" then
                                    Total := Int_Field (Get (Up, J), "TotalBoxes", 4);
                                 end if;
                              end loop;
                           end;
                        end if;
                     end;
                  end loop;
               end;
            end if;
            if Has_Field (Crew, "upgrades") then
               declare Up : constant JSON_Array := Get (Crew, "upgrades"); begin
                  for I in 1 .. Length (Up) loop
                     if Str_Field (Get (Up, I), "name") = "Mastery" then
                        Marked := Int_Field (Get (Up, I), "boxesMarked", 0);
                     end if;
                  end loop;
               end;
            end if;
            return (if Marked >= Total then 4 else 3);
         end;
      end;
   end Rating_Cap;

   function New_Character (Stem, Playbook : String) return JSON_Value is
      G : constant JSON_Value := Game (Stem);
      Id : constant String := New_Id;
      T : constant String := Now;
      C : JSON_Value;
      --  The stable DTO skeleton is intentionally explicit: it is the JSON boundary.
      Template : constant String :=
        "{""kind"":""character"",""id"":""" & Id & """,""gameStem"":""" & Stem
        & """,""gameName"":""" & Str_Field (G, "Name") & """,""language"":"""
        & Str_Field (G, "Language", "English") & """,""revision"":1,""formatVersion"":1,""createdAt"":"""
        & T & """,""updatedAt"":""" & T
        & """,""isRetired"":false,""isDeadish"":false,""traumaPending"":false,""isOutOfAction"":false,""stressClearPending"":false,""dossier"":{""name"":"""",""crewId"":"""",""alias"":"""",""look"":"""",""notes"":[],""background"":{""name"":"""",""description"":""""},""heritage"":{""name"":"""",""description"":""""},""vice"":{""name"":"""",""description"":"""",""purveyor"":{""name"":"""",""description"":""""}}},""monitor"":{""stress"":{""current"":0,""max"":9},""trauma"":{""traumas"":[],""max"":4},""harm"":{""lesser"":[],""moderate"":[],""severe"":[],""fatal"":[],""healingClock"":{""segments"":0,""size"":"
        & Trim_Image (Int_Field (G, "RecoveryClockSize", 4))
        & ",""rollover"":0}},""armor"":{""standardUsed"":false,""heavyUsed"":false,""specialUsed"":false,""hasStandard"":false,""hasHeavy"":false,""hasSpecial"":false}},""talent"":{""attributes"":[]},""playbook"":{""name"":"""
        & Playbook & """,""experience"":{""points"":0,""max"":8},""abilities"":[]},""gear"":{""loadout"":[],""availableGear"":[],""commitment"":""none"",""isCommitmentLocked"":false,""maxBulk"":9},""fund"":{""satchel"":{""coins"":2,""max"":4},""stash"":{""coins"":0,""max"":40}},""rolodex"":{""friends"":[]},""session"":{""playbookExpressions"":0,""characterExpressions"":0,""struggleExpressions"":0,""max"":"
        & Trim_Image (Int_Field (G, "SessionExpressionMax", 2))
        & "},""notebook"":""""}";
   begin
      C := Read (Template);
      --  Build attributes/actions and playbook defaults from game-settings JSON.
      if G.Kind = JSON_Object_Type and then Has_Field (G, "Attributes") then
         declare Out_A : JSON_Array := Empty_Array; Attrs : constant JSON_Array := Get (G, "Attributes"); begin
            for I in 1 .. Length (Attrs) loop
               declare A0 : constant JSON_Value := Get (Attrs, I); A : JSON_Value := Create_Object;
                  XP : JSON_Value := Create_Object; Acts : JSON_Array := Empty_Array;
               begin
                  Set_Field (A, "name", Str_Field (A0, "Name")); Set_Field (XP, "points", Integer'(0)); Set_Field (XP, "max", Integer'(6)); Set_Field (A, "experience", XP);
                  if Has_Field (A0, "Actions") then
                     declare AA : constant JSON_Array := Get (A0, "Actions"); begin
                        for J in 1 .. Length (AA) loop
                           declare X : JSON_Value := Create_Object; begin
                              Set_Field (X, "name", Str_Field (Get (AA, J), "Name")); Set_Field (X, "rating", Integer'(0));
                              Set_Field (X, "maxRating", Int_Field (G, "ActionPointMaximum", 4)); Append (Acts, X);
                           end;
                        end loop;
                     end;
                  end if;
                  Set_Field (A, "actions", Acts); Append (Out_A, A);
               end;
            end loop;
            Set_Field (Get (C, "talent"), "attributes", Out_A);
         end;
      end if;
      return C;
   end New_Character;

   function New_Crew (Stem, Crew_Type : String) return JSON_Value is
      G : constant JSON_Value := Game (Stem); Id : constant String := New_Id; T : constant String := Now;
   begin
      return Read ("{""kind"":""crew"",""id"":""" & Id & """,""gameStem"":""" & Stem
        & """,""gameName"":""" & Str_Field (G,"Name") & """,""language"":""" & Str_Field (G,"Language","English")
        & """,""revision"":1,""formatVersion"":1,""createdAt"":""" & T & """,""updatedAt"":""" & T
        & """,""crewTypeName"":""" & Crew_Type & """,""name"":"""",""lair"":"""",""reputation"":"""",""huntingGrounds"":"""",""tier"":0,""hold"":""weak"",""heat"":{""current"":0,""max"":9},""wanted"":{""current"":0,""max"":4},""rep"":{""current"":0,""max"":12},""experience"":{""points"":0,""max"":10},""specialAbilities"":[],""upgrades"":[],""cohorts"":[],""contacts"":[],""factions"":[],""coin"":0,""stash"":0,""turf"":0,""notes"":[],""claimedClaimIds"":[],""claimOverrides"":[]}");
   end New_Crew;

   --  SC-A1: the frozen clock create writes the Wave-2 canonical shape
   --  (behavior/ownerKind/ownerId/purpose/relatedClockIds).  The legacy
   --  pre-Wave-2 request shape (clockKind) is still accepted and mapped per
   --  legacy rule L5 (clockKind "project" -> behavior "bounded",
   --  "rollover" -> behavior "rollover"); the stored document is always the
   --  canonical shape.
   function New_Clock (B : JSON_Value) return JSON_Value is
      Id : constant String := New_Id; T : constant String := Now;
      Behavior : constant String :=
        (if Has_Field (B, "behavior") then Str_Field (B, "behavior", "bounded")
         elsif Str_Field (B, "clockKind", "project") = "rollover" then "rollover"
         else "bounded");
      C : JSON_Value;
   begin
      C := Read ("{""kind"":""clock"",""id"":""" & Id & """,""revision"":1,""formatVersion"":1,""createdAt"":""" & T & """,""updatedAt"":""" & T
        & """,""name"":""" & Str_Field (B,"name") & """,""ownerKind"":""" & Str_Field (B,"ownerKind","campaign")
        & """,""ownerId"":""" & Str_Field (B,"ownerId") & """,""purpose"":""" & Str_Field (B,"purpose","custom")
        & """,""behavior"":""" & Behavior & """,""segments"":0,""size"":" & Trim_Image (Int_Field (B,"size",4))
        & ",""rollover"":0,""relatedClockIds"":[]}");
      if Has_Field (B, "relatedClockIds") then
         Set_Field (C, "relatedClockIds", Clone (Get (B, "relatedClockIds")));
      end if;
      return C;
   end New_Clock;

   procedure Stamp (E : JSON_Value) is
   begin
      Set_Field (E, "revision", Int_Field (E, "revision") + 1);
      Set_Field (E, "updatedAt", Now);
   end Stamp;

   --  BUG-011 request-schema validation infrastructure.  Spec builds a
   --  field descriptor (name, JSON kind, min length, min int, enum, required)
   --  via a positional constructor so no record aggregates are needed.
   type Spec_Rec is record
      Nm   : Unbounded_String;
      Kd   : JSON_Value_Type;
      MnL  : Natural;
      MnI  : Integer;
      En   : Unbounded_String;
      Rq   : Boolean;
   end record;

   function Spec (Nm : String; Kd : JSON_Value_Type; MnL : Natural := 0;
                  MnI : Integer := Integer'First; En : String := "";
                  Rq : Boolean := True) return Spec_Rec is
   begin
      return (To_Unbounded_String (Nm), Kd, MnL, MnI, To_Unbounded_String (En), Rq);
   end Spec;

   type Spec_List is array (Positive range <>) of Spec_Rec;

   Allowed_Passed : Boolean := True;
   Allowed_Keys : Unbounded_String := Null_Unbounded_String;
   procedure Check_Allowed (Name : UTF8_String; Value : JSON_Value) is
   begin
      if Ada.Strings.Fixed.Index (To_String (Allowed_Keys), "|" & String (Name) & "|") = 0 then
         Allowed_Passed := False;
      end if;
   end Check_Allowed;

   function Has_Any_Field (B : JSON_Value) return Boolean is
      Count : Natural := 0;
      procedure Cnt (Name : UTF8_String; Value : JSON_Value) is begin Count := Count + 1; end Cnt;
   begin
      if B.Kind /= JSON_Object_Type then return False; end if;
      Map_JSON_Object (B, Cnt'Access);
      return Count > 0;
   end Has_Any_Field;

   function Check_Fields (B : JSON_Value; Specs : Spec_List; Bad : out Unbounded_String) return Boolean is
      Allowed : Unbounded_String := To_Unbounded_String ("|");
   begin
      for I in Specs'Range loop
         Allowed := Allowed & To_String (Specs (I).Nm) & "|";
      end loop;
      if B.Kind /= JSON_Object_Type then Bad := To_Unbounded_String("body must be an object"); return False; end if;
      Allowed_Keys := Allowed; Allowed_Passed := True;
      Map_JSON_Object (B, Check_Allowed'Access);
      if not Allowed_Passed then Bad := To_Unbounded_String("unknown field"); Allowed_Passed := True; return False; end if;
      for I in Specs'Range loop
         declare S : Spec_Rec := Specs (I); begin
            if S.Rq and then not Has_Field (B, To_String (S.Nm)) then
               Bad := To_Unbounded_String("missing required field ") & To_String (S.Nm); return False;
            end if;
            if Has_Field (B, To_String (S.Nm)) then
               declare V : constant JSON_Value := Get (B, To_String (S.Nm)); begin
                  if V.Kind /= S.Kd then
                     Bad := To_Unbounded_String("field ") & To_String (S.Nm) & " has wrong type"; return False;
                  end if;
                  if S.Kd = JSON_String_Type and then Str_Field (B, To_String (S.Nm))'Length < S.MnL then
                     Bad := To_Unbounded_String("field ") & To_String (S.Nm) & " too short"; return False;
                  end if;
                  if S.Kd = JSON_Int_Type and then Int_Field (B, To_String (S.Nm)) < S.MnI then
                     Bad := To_Unbounded_String("field ") & To_String (S.Nm) & " below minimum"; return False;
                  end if;
                  if S.Kd = JSON_String_Type and then Length (S.En) > 0 then
                     declare
                        Val : constant String := Str_Field (B, To_String (S.Nm));
                        EStr : constant String := To_String (S.En);
                        P : Natural := 1; E : Natural := 1; Ok : Boolean := False;
                     begin
                        while E <= EStr'Length + 1 loop
                           if E > EStr'Length or else EStr (E) = '|' then
                              if EStr (P .. E - 1) = Val then Ok := True; exit; end if;
                              P := E + 1;
                           end if;
                           E := E + 1;
                        end loop;
                        if not Ok then Bad := To_Unbounded_String("field ") & To_String (S.Nm) & " out of enum"; return False; end if;
                     end;
                  end if;
               end;
            end if;
         end;
      end loop;
      return True;
   end Check_Fields;


   --  BUG-011: per-operation request-schema validation, mirroring the frozen
   --  OpenAPI request bodies.  Returns True when valid; Bad carries the
   --  reason.  Called BEFORE any mutation so invalid requests mutate nothing.
   function Validate_Request (Kind, Op : String; B : JSON_Value; Bad : out Unbounded_String) return Boolean is
      T : String := "";
   begin
      if Op = "character.create" then
         return Check_Fields (B, (Spec ("gameStem", JSON_String_Type),
                                  Spec ("playbook", JSON_String_Type)), Bad);
      elsif Op = "crew.create" then
         return Check_Fields (B, (Spec ("gameStem", JSON_String_Type),
                                  Spec ("crewType", JSON_String_Type)), Bad);
      elsif Op = "clock.create" then
         --  SC-A1: the frozen create request is
         --  {name, behavior, size, purpose, ownerKind, ownerId,
         --  relatedClockIds}; the legacy pre-Wave-2 shape (name/clockKind/
         --  size) is still accepted and mapped per L5.  Every stored clock
         --  is the canonical Wave-2 shape.
         if not Check_Fields (B, (Spec ("name", JSON_String_Type, MnL => 1),
                                  Spec ("size", JSON_Int_Type, MnI => 1),
                                  Spec ("behavior", JSON_String_Type,
                                        En => "bounded|rollover", Rq => False),
                                  Spec ("clockKind", JSON_String_Type,
                                        En => "project|rollover", Rq => False),
                                  Spec ("purpose", JSON_String_Type,
                                        En => "progress|danger|racing|linked|mission|tug-of-war|long-term-project|faction|score|custom",
                                        Rq => False),
                                  Spec ("ownerKind", JSON_String_Type,
                                        En => "campaign|character|crew", Rq => False),
                                  Spec ("ownerId", JSON_String_Type, Rq => False),
                                  Spec ("relatedClockIds", JSON_Array_Type, Rq => False)), Bad)
         then
            return False;
         end if;
         if not Has_Field (B, "behavior") and then not Has_Field (B, "clockKind") then
            Bad := To_Unbounded_String ("clock.create requires behavior or clockKind");
            return False;
         end if;
         return True;
      elsif Op = "harm.add" or else Op = "harm.remove" then
         return Check_Fields (B, (Spec ("description", JSON_String_Type, MnL => 1),
                                  Spec ("intensity", JSON_String_Type, En => "lesser|moderate|severe|fatal")), Bad);
      elsif Op = "stress.add" then
         return Check_Fields (B, Spec_List'(1 => Spec ("delta", JSON_Int_Type)), Bad);
      elsif Op = "trauma.add" or else Op = "trauma.remove" then
         return Check_Fields (B, Spec_List'(1 => Spec ("trauma", JSON_String_Type, MnL => 1)), Bad);
      elsif Op = "armor.set" then
         return Check_Fields (B, (Spec ("armor", JSON_String_Type, En => "standard|heavy|special"),
                                  Spec ("used", JSON_Boolean_Type)), Bad);
      elsif Op = "gear.add" or else Op = "gear.remove" then
         return Check_Fields (B, (Spec ("name", JSON_String_Type, MnL => 1),
                                  Spec ("bulk", JSON_Int_Type, MnI => 0, Rq => False)), Bad);
      elsif Op = "gear.commit" or else Op = "gear.uncommit" then
         return Check_Fields (B, Spec_List'(1 => Spec ("name", JSON_String_Type, MnL => 1)), Bad);
      elsif Op = "gear.set-commitment" then
         return Check_Fields (B, Spec_List'(1 => Spec ("commitment", JSON_String_Type, En => "none|light|normal|heavy|encumbered")), Bad);
      elsif Op = "fund.gain" or else Op = "fund.spend" or else Op = "fund.liquidate" then
         return Check_Fields (B, Spec_List'(1 => Spec ("coins", JSON_Int_Type, MnI => 1)), Bad);
      elsif Op = "rolodex.add" or else Op = "rolodex.remove" then
         return Check_Fields (B, Spec_List'(1 => Spec ("entry", JSON_String_Type, MnL => 1)), Bad);
      elsif Op = "rolodex.set-closeness" then
         return Check_Fields (B, (Spec ("entry", JSON_String_Type, MnL => 1),
                                  Spec ("closeness", JSON_String_Type, En => "friend|close-friend|rival")), Bad);
      elsif Op = "note.add" then
         return Check_Fields (B, Spec_List'(1 => Spec ("text", JSON_String_Type, MnL => 1)), Bad);
      elsif Op = "note.remove" then
         return Check_Fields (B, Spec_List'(1 => Spec ("index", JSON_Int_Type, MnI => 0)), Bad);
      elsif Op = "session.set" then
         if not Has_Any_Field (B) then Bad := To_Unbounded_String("session.set requires at least one expression field"); return False; end if;
         return Check_Fields (B, (Spec ("playbookExpressions", JSON_Int_Type, MnI => 0, Rq => False),
                                  Spec ("characterExpressions", JSON_Int_Type, MnI => 0, Rq => False),
                                  Spec ("struggleExpressions", JSON_Int_Type, MnI => 0, Rq => False)), Bad);
      elsif Op = "dossier.update" then
         if not Has_Any_Field (B) then Bad := To_Unbounded_String("dossier.update requires at least one field"); return False; end if;
         return Check_Fields (B, (Spec ("name", JSON_String_Type, Rq => False),
                                  Spec ("crewId", JSON_String_Type, Rq => False),
                                  Spec ("alias", JSON_String_Type, Rq => False),
                                  Spec ("look", JSON_String_Type, Rq => False),
                                  Spec ("notes", JSON_Array_Type, Rq => False),
                                  Spec ("background", JSON_Object_Type, Rq => False),
                                  Spec ("heritage", JSON_Object_Type, Rq => False),
                                  Spec ("vice", JSON_Object_Type, Rq => False)), Bad);
      elsif Op = "heat.add" or else Op = "wanted.add" or else Op = "rep.add"
        or else Op = "xp.add" or else Op = "turf.add" or else Op = "coin.add"
        or else Op = "stash.add" or else Op = "tier.add"
      then
         return Check_Fields (B, Spec_List'(1 => Spec ("delta", JSON_Int_Type)), Bad);
      elsif Op = "hold.set" then
         return Check_Fields (B, Spec_List'(1 => Spec ("hold", JSON_String_Type, En => "strong|weak")), Bad);
      elsif Op = "cohort.add" then
         return Check_Fields (B, (Spec ("cohortKind", JSON_String_Type, En => "gang|expert"),
                                  Spec ("gangType", JSON_String_Type, Rq => False),
                                  Spec ("expertType", JSON_String_Type, Rq => False),
                                  Spec ("quality", JSON_Int_Type, MnI => 0, Rq => False),
                                  Spec ("scale", JSON_Int_Type, MnI => 0, Rq => False)), Bad);
      elsif Op = "contact.add" then
         return Check_Fields (B, (Spec ("name", JSON_String_Type, MnL => 1),
                                  Spec ("profession", JSON_String_Type)), Bad);
      elsif Op = "contact.remove" then
         return Check_Fields (B, Spec_List'(1 => Spec ("name", JSON_String_Type, MnL => 1)), Bad);
      elsif Op = "faction.set-status" then
         return Check_Fields (B, (Spec ("name", JSON_String_Type, MnL => 1),
                                  Spec ("status", JSON_Int_Type)), Bad);
      elsif Op = "faction.remove" then
         return Check_Fields (B, Spec_List'(1 => Spec ("name", JSON_String_Type, MnL => 1)), Bad);
      elsif Op = "upgrade.mark" or else Op = "upgrade.unmark" then
         return Check_Fields (B, Spec_List'(1 => Spec ("name", JSON_String_Type, MnL => 1)), Bad);
      elsif Op = "end-score" then
         --  W15: the body is optional — a missing or empty body is valid;
         --  only present fields are constrained.
         return Check_Fields (B, (Spec ("clearArmorUsed", JSON_Boolean_Type, Rq => False),
                                  Spec ("resetLoadoutCommitment", JSON_Boolean_Type, Rq => False)), Bad);
      elsif Op = "retire" then
         return Check_Fields (B, Spec_List'(1 => Spec ("confirm", JSON_Boolean_Type)), Bad);
      elsif Op = "end-downtime" then
         return Check_Fields (B, (Spec ("clearSessionExpressions", JSON_Boolean_Type, Rq => False),
                                  Spec ("viceReliefStress", JSON_Int_Type, MnI => 0, Rq => False)), Bad);
      elsif Op = "claim.set" then
         return Check_Fields (B, (Spec ("claimId", JSON_String_Type, MnL => 1),
                                  Spec ("claimed", JSON_Boolean_Type)), Bad);
      elsif Op = "claim.customize" then
         if not Has_Any_Field (B) then
            Bad := To_Unbounded_String ("claim.customize requires claimId"); return False;
         end if;
         return Check_Fields (B, (Spec ("claimId", JSON_String_Type, MnL => 1),
                                  Spec ("name", JSON_String_Type, Rq => False),
                                  Spec ("description", JSON_String_Type, Rq => False),
                                  Spec ("effects", JSON_Array_Type, Rq => False)), Bad);
      elsif Op = "claim.reset" then
         return Check_Fields (B, Spec_List'(1 => Spec ("claimId", JSON_String_Type, MnL => 1)), Bad);
      elsif Op = "clock.progress" then
         return Check_Fields (B, Spec_List'(1 => Spec ("segments", JSON_Int_Type, MnI => 0)), Bad);
      elsif Op = "clock.reset" then
         return True;
      elsif Op = "fields.update" then
         if not Has_Any_Field (B) then Bad := To_Unbounded_String ("fields.update requires at least one field"); return False; end if;
         return True;
      end if;
      return True;
   end Validate_Request;

   ---------------------------------------------------------------------------
   --  SC-A1 canonicalizer (R0 matrix).  Pure: never writes.
   --
   --  Normalizes a parsed entity document per the frozen schemas and the R0
   --  canonicalization matrix (docs/pages/contract/wave0/
   --  canonicalization-matrix.mdx): missing/null -> canonical defaults (D1/
   --  D2), lossless coercions (D3), legacy enum variants (D4 via L2),
   --  deterministic clamps (D5), unknown-key listings (D6), legacy shapes
   --  L1-L8 (D7), identity normalization (D8), needs-input pointers, sparse
   --  claimOverrides preserved as-is.  The result is the ordered change list
   --  {pointer, reason, previous, replacement} plus warnings and
   --  needs-input pointers, in the frozen previewResult shape.  SC-A2
   --  (import/repair transactions) and SC-A3 (stored admission) consume it.
   ---------------------------------------------------------------------------

   Allowed_Character : constant String :=
     "|kind|id|gameStem|gameName|language|revision|formatVersion|createdAt|" &
     "updatedAt|isRetired|isDeadish|traumaPending|isOutOfAction|" &
     "stressClearPending|dossier|monitor|talent|playbook|gear|fund|rolodex|" &
     "session|notebook|";
   Allowed_Dossier : constant String :=
     "|name|crewId|alias|look|notes|background|heritage|vice|";
   Allowed_Named_Desc : constant String := "|name|description|";
   Allowed_Vice : constant String := "|name|description|purveyor|";
   Allowed_Monitor : constant String := "|stress|trauma|harm|armor|";
   Allowed_Bounded : constant String := "|current|max|";
   Allowed_Trauma : constant String := "|traumas|max|";
   Allowed_Harm : constant String := "|lesser|moderate|severe|fatal|healingClock|";
   Allowed_Healing : constant String := "|segments|size|rollover|";
   Allowed_Armor : constant String :=
     "|standardUsed|heavyUsed|specialUsed|hasStandard|hasHeavy|hasSpecial|";
   Allowed_Talent : constant String := "|attributes|";
   Allowed_Attribute : constant String := "|name|experience|actions|";
   Allowed_Action : constant String := "|name|rating|maxRating|";
   Allowed_Experience : constant String := "|points|max|";
   Allowed_Playbook : constant String := "|name|experience|abilities|";
   Allowed_Ability : constant String := "|name|description|timesTaken|";
   Allowed_Gear : constant String :=
     "|loadout|availableGear|commitment|isCommitmentLocked|maxBulk|";
   Allowed_Gear_Item : constant String := "|name|bulk|";
   Allowed_Fund : constant String := "|satchel|stash|";
   Allowed_Satchel : constant String := "|coins|max|";
   Allowed_Rolodex : constant String := "|friends|";
   Allowed_Friend : constant String := "|entry|closeness|";
   Allowed_Session : constant String :=
     "|playbookExpressions|characterExpressions|struggleExpressions|max|";
   Allowed_Crew : constant String :=
     "|kind|id|gameStem|gameName|language|revision|formatVersion|createdAt|" &
     "updatedAt|crewTypeName|name|lair|reputation|huntingGrounds|tier|hold|" &
     "heat|wanted|rep|experience|specialAbilities|upgrades|cohorts|coin|" &
     "stash|notes|turf|contacts|factions|claimedClaimIds|claimOverrides|";
   Allowed_Spec_Ability : constant String := "|name|timesTaken|";
   Allowed_Upgrade : constant String := "|name|boxesMarked|";
   Allowed_Cohort : constant String :=
     "|id|cohortKind|gangType|expertType|quality|scale|hasArmor|edges|flaws|" &
     "harm|description|";
   Allowed_Contact : constant String := "|name|profession|";
   Allowed_Faction : constant String := "|name|status|";
   Allowed_Override : constant String := "|claimId|name|description|effects|";
   Allowed_Clock : constant String :=
     "|kind|id|revision|formatVersion|createdAt|updatedAt|name|ownerKind|" &
     "ownerId|purpose|behavior|segments|size|rollover|relatedClockIds|";

   --  Normalization context: ordered change list, warnings, needs-input
   --  pointers, and needs-input issues, accumulated in walk order (schema
   --  property order at every level — deterministic).
   type N_Ctx is record
      Changes  : JSON_Array := Empty_Array;
      Warnings : JSON_Array := Empty_Array;
      Needs    : JSON_Array := Empty_Array;
      Issues   : JSON_Array := Empty_Array;
   end record;

   procedure Add_Change
     (C : in out N_Ctx; Ptr, Reason : String;
      Prev, Repl : JSON_Value; Warning : String)
   is
      X : JSON_Value := Create_Object;
   begin
      Set_Field (X, "pointer", Ptr);
      Set_Field (X, "reason", Reason);
      Set_Field (X, "previous", Clone (Prev));
      Set_Field (X, "replacement", Clone (Repl));
      Append (C.Changes, X);
      Append (C.Warnings, Create (Warning));
   end Add_Change;

   procedure Add_Needs (C : in out N_Ctx; Ptr, Reason, Expected : String) is
   begin
      Append (C.Needs, Create (Ptr));
      Append (C.Issues, Issue_At (Ptr, Reason, Expected));
   end Add_Needs;

   --  Deterministic unknown-key iteration: GNATCOLL's object map order is
   --  not contractual, so keys are collected and sorted before reporting.
   Max_Object_Keys : constant := 512;
   type Key_Buffer is array (1 .. Max_Object_Keys) of Unbounded_String;

   procedure Collect_Keys (O : JSON_Value; K : in out Key_Buffer; N : out Natural) is
      procedure Add (Name : UTF8_String; Value : JSON_Value) is
      begin
         if N < Max_Object_Keys then
            N := N + 1;
            K (N) := To_Unbounded_String (String (Name));
         end if;
      end Add;
   begin
      N := 0;
      if O.Kind = JSON_Object_Type then Map_JSON_Object (O, Add'Access); end if;
   end Collect_Keys;

   procedure Sort_Keys (K : in out Key_Buffer; N : Natural) is
   begin
      for I in 1 .. N - 1 loop
         for J in I + 1 .. N loop
            if To_String (K (J)) < To_String (K (I)) then
               declare T : constant Unbounded_String := K (I); begin
                  K (I) := K (J);
                  K (J) := T;
               end;
            end if;
         end loop;
      end loop;
   end Sort_Keys;

   function In_Allowed (Name : String; Allowed : String) return Boolean is
   begin
      return Ada.Strings.Fixed.Index (Allowed, "|" & Name & "|") > 0;
   end In_Allowed;

   --  D6: unknown keys are never defaulted and never silently dropped —
   --  each is listed as a removal the preview must display.  Exempt names
   --  (pipe-wrapped, e.g. "|clockKind|") were converted by an explicit
   --  legacy rule and have their own change entry.
   procedure List_Removals
     (O : JSON_Value; Ptr, Allowed : String; C : in out N_Ctx;
      Exempt : String := "")
   is
      K : Key_Buffer;
      N : Natural;
   begin
      Collect_Keys (O, K, N);
      Sort_Keys (K, N);
      for I in 1 .. N loop
         declare
            Name : constant String := To_String (K (I));
         begin
            if not In_Allowed (Name, Allowed)
              and then (Exempt = "" or else not In_Allowed (Name, Exempt))
            then
               declare
                  P : constant String := Ptr & "/" & Name;
                  V : constant JSON_Value := Get (O, Name);
                  E : JSON_Value := Create_Object;
               begin
                  Set_Field (E, "pointer", P);
                  Set_Field (E, "reason", "unknown-key removal");
                  Set_Field (E, "previous", Clone (V));
                  Set_Field (E, "replacement", JSON_Null);
                  Append (C.Changes, E);
                  Append (C.Warnings, Create
                            ("Unknown property " & P
                             & " will be removed (data loss); removal must be confirmed"));
               end;
            end if;
         end;
      end loop;
   end List_Removals;

   --  Hand-rolled pattern matchers (the generated validator owns strict
   --  admission; the canonicalizer needs the same vocabulary to decide
   --  whether a value is derivable).
   function Is_Hex (C : Character) return Boolean is
     (C in '0' .. '9' or else C in 'a' .. 'f');

   function Is_Uuid (S : String) return Boolean is
   begin
      if S'Length /= 36 then return False; end if;
      for I in S'Range loop
         declare
            P : constant Natural := I - S'First + 1;
         begin
            if P in 9 | 14 | 19 | 24 then
               if S (I) /= '-' then return False; end if;
            elsif P = 15 then
               if S (I) /= '4' then return False; end if;
            elsif P = 20 then
               if S (I) not in '8' | '9' | 'a' | 'b' then return False; end if;
            else
               if not Is_Hex (S (I)) then return False; end if;
            end if;
         end;
      end loop;
      return True;
   end Is_Uuid;

   function Is_Claim_Id (S : String) return Boolean is
   begin
      if S'Length = 0 then return False; end if;
      for I in S'Range loop
         if S (I) = '-' then
            if I = S'First or else I = S'Last then return False; end if;
            if S (I - 1) = '-' then return False; end if;
         elsif not (S (I) in 'a' .. 'z' or else S (I) in '0' .. '9') then
            return False;
         end if;
      end loop;
      return True;
   end Is_Claim_Id;

   function Valid_Stem (S : String) return Boolean is
   begin
      if S'Length = 0 then return False; end if;
      for I in S'Range loop
         if not (S (I) in 'a' .. 'z' or else S (I) in 'A' .. 'Z'
                 or else S (I) in '0' .. '9' or else S (I) = '-')
         then
            return False;
         end if;
      end loop;
      return True;
   end Valid_Stem;

   --  D3 lossless coercion: integer string <-> number.
   function Int_From_String (S : String; V : out Integer) return Boolean is
      N : Long_Long_Integer := 0;
      Neg : constant Boolean := S'Length > 0 and then S (S'First) = '-';
      First : constant Integer := (if Neg then S'First + 1 else S'First);
   begin
      if S'Length = 0 or else First > S'Last then return False; end if;
      for I in First .. S'Last loop
         if S (I) not in '0' .. '9' then return False; end if;
         N := N * 10 + Long_Long_Integer (Character'Pos (S (I)) - 48);
      end loop;
      if Neg then N := -N; end if;
      if N < Long_Long_Integer (Integer'First)
        or else N > Long_Long_Integer (Integer'Last)
      then
         return False;
      end if;
      V := Integer (N);
      return True;
   end Int_From_String;

   --  The owning campaign's gameStem, for the campaign-derived fill.
   function Campaign_Stem return String is
      F : constant String := To_String (Data_Root) & "/campaign.json";
   begin
      if not Ada.Directories.Exists (F) then return ""; end if;
      return Str_Field (Read (Read_File (F)), "gameStem");
   exception
      when others => return "";
   end Campaign_Stem;

   --  Resolved game settings for DERIVED fills.
   type Settings_Ref is record
      Stem : Unbounded_String := Null_Unbounded_String;
      G    : JSON_Value := JSON_Null;
   end record;

   function Settings_Int (S : Settings_Ref; Key : String; Fallback : Integer) return Integer is
      --  Key may be a dotted path into the settings object
      --  (e.g. "FundMaxima.SatchelMax").
      V : JSON_Value := S.G;
      P : Integer := Key'First;
   begin
      if V.Kind /= JSON_Object_Type or else Key'Length = 0 then return Fallback; end if;
      loop
         declare
            E : Integer := P;
         begin
            while E <= Key'Last and then Key (E) /= '.' loop E := E + 1; end loop;
            declare
               Part : constant String := Key (P .. E - 1);
            begin
               if not Has_Field (V, Part) then return Fallback; end if;
               V := Get (V, Part);
               if V.Kind /= JSON_Object_Type and then E <= Key'Last then return Fallback; end if;
            end;
            exit when E > Key'Last;
            P := E + 1;
         end;
      end loop;
      if V.Kind = JSON_Int_Type then return Integer'(Get (V)); end if;
      return Fallback;
   end Settings_Int;

   --  L2: known legacy PascalCase enum variants (deterministic one-to-one;
   --  a variant not in the table is needs-input, never a guess).
   type Legacy_Pair is record
      From_V : Unbounded_String;
      To_V   : Unbounded_String;
   end record;
   type Legacy_Map is array (Positive range <>) of Legacy_Pair;

   Hold_Legacy : constant Legacy_Map :=
     ((To_Unbounded_String ("Strong"), To_Unbounded_String ("strong")),
      (To_Unbounded_String ("Weak"),   To_Unbounded_String ("weak")));
   Closeness_Legacy : constant Legacy_Map :=
     ((To_Unbounded_String ("Friend"),      To_Unbounded_String ("friend")),
      (To_Unbounded_String ("CloseFriend"), To_Unbounded_String ("close-friend")),
      (To_Unbounded_String ("Rival"),       To_Unbounded_String ("rival")));
   Commitment_Legacy : constant Legacy_Map :=
     ((To_Unbounded_String ("None"),       To_Unbounded_String ("none")),
      (To_Unbounded_String ("Light"),      To_Unbounded_String ("light")),
      (To_Unbounded_String ("Normal"),     To_Unbounded_String ("normal")),
      (To_Unbounded_String ("Heavy"),      To_Unbounded_String ("heavy")),
      (To_Unbounded_String ("Encumbered"), To_Unbounded_String ("encumbered")));
   Cohort_Type_Legacy : constant Legacy_Map :=
     ((To_Unbounded_String ("Gang"),   To_Unbounded_String ("gang")),
      (To_Unbounded_String ("Expert"), To_Unbounded_String ("expert")));
   Cohort_Harm_Legacy : constant Legacy_Map :=
     ((To_Unbounded_String ("Healthy"),  To_Unbounded_String ("healthy")),
      (To_Unbounded_String ("Weakened"), To_Unbounded_String ("weakened")),
      (To_Unbounded_String ("Impaired"), To_Unbounded_String ("impaired")),
      (To_Unbounded_String ("Broken"),   To_Unbounded_String ("broken")),
      (To_Unbounded_String ("Dead"),     To_Unbounded_String ("dead")));

   --  Empty legacy map for enums without legacy variants.
   No_Legacy : constant Legacy_Map :=
     (1 .. 0 => (Null_Unbounded_String, Null_Unbounded_String));

   --  L3: canonical item member names with their C# camelCase/PascalCase
   --  spellings, used when a legacy dictionary item is converted.
   type Name_Pair is record
      Canon : Unbounded_String;
      Alt   : Unbounded_String;
   end record;
   type Name_Map is array (Positive range <>) of Name_Pair;

   Item_Field_Aliases : constant Name_Map :=
     ((To_Unbounded_String ("name"),        To_Unbounded_String ("Name")),
      (To_Unbounded_String ("description"), To_Unbounded_String ("Description")),
      (To_Unbounded_String ("timesTaken"),  To_Unbounded_String ("TimesTaken")),
      (To_Unbounded_String ("bulk"),        To_Unbounded_String ("Bulk")),
      (To_Unbounded_String ("rating"),      To_Unbounded_String ("Rating")),
      (To_Unbounded_String ("maxRating"),   To_Unbounded_String ("MaxRating")),
      (To_Unbounded_String ("points"),      To_Unbounded_String ("Points")),
      (To_Unbounded_String ("max"),         To_Unbounded_String ("Max")),
      (To_Unbounded_String ("boxesMarked"), To_Unbounded_String ("BoxesMarked")),
      (To_Unbounded_String ("experience"),  To_Unbounded_String ("Experience")),
      (To_Unbounded_String ("actions"),     To_Unbounded_String ("actionsByName")),
      (To_Unbounded_String ("actions"),     To_Unbounded_String ("ActionsByName")),
      (To_Unbounded_String ("profession"),  To_Unbounded_String ("Profession")));

   --  FILL string property (missing/null -> Default).
   function N_Str (O : JSON_Value; Name, Ptr : String; Default : String;
                   C : in out N_Ctx) return JSON_Value is
   begin
      if not Has_Field (O, Name) or else Get (O, Name).Kind = JSON_Null_Type then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Create (Default),
                     (if Has_Field (O, Name)
                      then "Property " & Ptr & " is null (null is never stored): "
                           & "normalized to canonical default "
                           & (if Default = "" then """" else Default)
                      else "Missing required property " & Ptr
                           & ": filled with canonical default "
                           & (if Default = "" then """" else Default)));
         return Create (Default);
      end if;
      declare V : constant JSON_Value := Get (O, Name); begin
         if V.Kind = JSON_String_Type then return Clone (V); end if;
         if V.Kind = JSON_Int_Type then
            declare N : constant Integer := Integer'(Get (V)); begin
               Add_Change (C, Ptr, "type coercion", Clone (V), Create (Trim_Image (N)),
                           "Property " & Ptr & " had type number, expected string: converted to "
                           & Trim_Image (N));
               return Create (Trim_Image (N));
            end;
         end if;
         Add_Needs (C, Ptr, "wrong type: cannot be converted to string", "a string value");
         return Clone (V);
      end;
   end N_Str;

   --  NEEDS-INPUT string property (minLength 1): no canonical default.
   function N_Str_Required (O : JSON_Value; Name, Ptr : String; C : in out N_Ctx;
                            Min_Len : Natural := 1) return JSON_Value is
   begin
      if Has_Field (O, Name) and then Get (O, Name).Kind /= JSON_Null_Type then
         declare V : constant JSON_Value := Get (O, Name); begin
            if V.Kind = JSON_String_Type then
               if Str_Field (O, Name)'Length >= Min_Len then return Clone (V); end if;
               Add_Needs (C, Ptr, "too short: needs at least " & Trim_Image (Min_Len)
                          & " character(s)", "a string of at least " & Trim_Image (Min_Len)
                          & " characters");
               return Clone (V);
            end if;
            Add_Needs (C, Ptr, "wrong type: expected a string", "a string value");
            return Clone (V);
         end;
      end if;
      Add_Needs (C, Ptr, "missing required property (no canonical default)",
                 "a caller-supplied value");
      return JSON_Null;
   end N_Str_Required;

   --  FILL boolean (missing/null -> False; "true"/"false" strings coerce).
   function N_Bool (O : JSON_Value; Name, Ptr : String; C : in out N_Ctx) return JSON_Value is
   begin
      if not Has_Field (O, Name) or else Get (O, Name).Kind = JSON_Null_Type then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Create (False),
                     "Missing required property " & Ptr & ": filled with canonical default false");
         return Create (False);
      end if;
      declare V : constant JSON_Value := Get (O, Name); begin
         if V.Kind = JSON_Boolean_Type then return Clone (V); end if;
         if V.Kind = JSON_String_Type then
            declare S : constant String := Str_Field (O, Name); begin
               if S = "true" then
                  Add_Change (C, Ptr, "type coercion", Clone (V), Create (True),
                              "Property " & Ptr & " had type string, expected boolean: converted to true");
                  return Create (True);
               elsif S = "false" then
                  Add_Change (C, Ptr, "type coercion", Clone (V), Create (False),
                              "Property " & Ptr & " had type string, expected boolean: converted to false");
                  return Create (False);
               end if;
            end;
         end if;
         Add_Needs (C, Ptr, "wrong type: expected a boolean", "true or false");
         return Clone (V);
      end;
   end N_Bool;

   --  FILL integer (missing/null -> Default; integer strings coerce; D5
   --  deterministic clamp to [Min, Max]).
   function N_Int (O : JSON_Value; Name, Ptr : String; Default : Integer;
                   C : in out N_Ctx; Min : Integer := Integer'First;
                   Max : Integer := Integer'Last) return JSON_Value is
   begin
      if not Has_Field (O, Name) or else Get (O, Name).Kind = JSON_Null_Type then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Create (Default),
                     "Missing required property " & Ptr
                     & ": filled with canonical default " & Trim_Image (Default));
         return Create (Default);
      end if;
      declare
         V : constant JSON_Value := Get (O, Name);
         N : Integer;
      begin
         if V.Kind = JSON_Int_Type then
            N := Integer'(Get (V));
         elsif V.Kind = JSON_String_Type then
            if not Int_From_String (Str_Field (O, Name), N) then
               Add_Needs (C, Ptr, "wrong type: non-integer string cannot be converted",
                          "an integer value");
               return Clone (V);
            end if;
            Add_Change (C, Ptr, "type coercion", Clone (V), Create (N),
                        "Property " & Ptr & " had type string, expected integer: converted to "
                        & Trim_Image (N));
         else
            Add_Needs (C, Ptr, "wrong type: cannot be converted to integer", "an integer value");
            return Clone (V);
         end if;
         if N < Min or else N > Max then
            declare B : constant Integer := Integer'Max (Min, Integer'Min (Max, N)); begin
               Add_Change (C, Ptr, "clamp", Create (N), Create (B),
                           "Property " & Ptr & " value " & Trim_Image (N)
                           & " is outside [" & Trim_Image (Min) & ", " & Trim_Image (Max)
                           & "]: clamped to " & Trim_Image (B));
               return Create (B);
            end;
         end if;
         return Create (N);
      end;
   end N_Int;

   --  DERIVED integer fill: settings value when the game stem resolves
   --  (C# fallback for a missing settings key), needs-input when the stem
   --  cannot be resolved (R0 matrix: "needs-input when gameStem unresolved").
   function N_Int_Derived (O : JSON_Value; Name, Ptr : String; S : Settings_Ref;
                           Key : String; Fallback : Integer; C : in out N_Ctx)
                          return JSON_Value
   is
   begin
      if Has_Field (O, Name) and then Get (O, Name).Kind /= JSON_Null_Type then
         declare V : constant JSON_Value := Get (O, Name); begin
            if V.Kind = JSON_Int_Type then
               if Integer'(Get (V)) < 0 then
                  Add_Change (C, Ptr, "clamp", Clone (V), Create (Integer'(0)),
                              "Property " & Ptr & " value " & Trim_Image (Integer'(Get (V)))
                              & " is below minimum 0: clamped to 0");
                  return Create (Integer'(0));
               end if;
               return Clone (V);
            end if;
            if V.Kind = JSON_String_Type then
               declare N : Integer; begin
                  if Int_From_String (Str_Field (O, Name), N) then
                     if N < 0 then
                        Add_Change (C, Ptr, "clamp", Clone (V), Create (Integer'(0)),
                                    "Property " & Ptr & " value " & Trim_Image (N)
                                    & " is below minimum 0: clamped to 0");
                        return Create (Integer'(0));
                     end if;
                     Add_Change (C, Ptr, "type coercion", Clone (V), Create (N),
                                 "Property " & Ptr & " had type string, expected integer: converted to "
                                 & Trim_Image (N));
                     return Create (N);
                  end if;
               end;
            end if;
            Add_Needs (C, Ptr, "wrong type: expected an integer", "an integer value");
            return Clone (V);
         end;
      end if;
      if S.G.Kind = JSON_Object_Type then
         declare Val : constant Integer := Settings_Int (S, Key, Fallback); begin
            Add_Change (C, Ptr, "derived fill", JSON_Null, Create (Val),
                        "Missing required property " & Ptr
                        & ": filled with settings-derived default " & Trim_Image (Val));
            return Create (Val);
         end;
      end if;
      Add_Needs (C, Ptr, "missing required property (settings-derived; gameStem unresolved)",
                 "a caller-supplied value");
      return JSON_Null;
   end N_Int_Derived;

   --  minimum-1 counters (timesTaken/boxesMarked): legacy dictionary items
   --  carry their value (L3); missing has no neutral value -> needs-input;
   --  present values clamp to the declared minimum (D5).
   function N_Min1 (O : JSON_Value; Name, Ptr : String; C : in out N_Ctx) return JSON_Value is
   begin
      if Has_Field (O, Name) and then Get (O, Name).Kind /= JSON_Null_Type then
         declare
            V : constant JSON_Value := Get (O, Name);
            N : Integer;
         begin
            if V.Kind = JSON_Int_Type then
               N := Integer'(Get (V));
            elsif V.Kind = JSON_String_Type then
               if not Int_From_String (Str_Field (O, Name), N) then
                  Add_Needs (C, Ptr, "wrong type: non-integer string cannot be converted",
                             "an integer value");
                  return Clone (V);
               end if;
               Add_Change (C, Ptr, "type coercion", Clone (V), Create (N),
                           "Property " & Ptr & " had type string, expected integer: converted to "
                           & Trim_Image (N));
            else
               Add_Needs (C, Ptr, "wrong type: expected an integer", "an integer value");
               return Clone (V);
            end if;
            if N < 1 then
               Add_Change (C, Ptr, "clamp", Create (N), Create (Integer'(1)),
                           "Property " & Ptr & " value " & Trim_Image (N)
                           & " is below minimum 1: clamped to 1");
               return Create (Integer'(1));
            end if;
            return Create (N);
         end;
      end if;
      Add_Needs (C, Ptr, "missing required property (no neutral value)",
                 "a caller-supplied value");
      return JSON_Null;
   end N_Min1;

   --  FILL enum with L2 legacy variant mapping; Default "" = no default
   --  (missing -> needs-input).
   function N_Enum (O : JSON_Value; Name, Ptr : String; C : in out N_Ctx;
                    Allowed : String; Legacy : Legacy_Map;
                    Default : String := "") return JSON_Value
   is
   begin
      if not Has_Field (O, Name) or else Get (O, Name).Kind = JSON_Null_Type then
         if Default /= "" then
            Add_Change (C, Ptr, "missing/null fill", JSON_Null, Create (Default),
                        "Missing required property " & Ptr
                        & ": filled with canonical default " & Default);
            return Create (Default);
         end if;
         Add_Needs (C, Ptr, "missing required property (no canonical default)",
                    "one of " & Allowed);
         return JSON_Null;
      end if;
      declare V : constant JSON_Value := Get (O, Name); begin
         if V.Kind /= JSON_String_Type then
            Add_Needs (C, Ptr, "wrong type: expected a string", "one of " & Allowed);
            return Clone (V);
         end if;
         declare
            S : constant String := Str_Field (O, Name);
         begin
            if In_Allowed (S, Allowed) then return Create (S); end if;
            for I in Legacy'Range loop
               if To_String (Legacy (I).From_V) = S then
                  Add_Change (C, Ptr, "legacy conversion (L2)", Create (S),
                              Create (To_String (Legacy (I).To_V)),
                              "Property " & Ptr & " value '" & S & "' is not in " & Allowed
                              & ": mapped from legacy variant to " & To_String (Legacy (I).To_V));
                  return Create (To_String (Legacy (I).To_V));
               end if;
            end loop;
            Add_Change (C, Ptr,
                        "needs-input: enum variant " & S & " not in " & Allowed
                        & ": requires caller-supplied value",
                        Create (S), JSON_Null,
                        "Property " & Ptr & " value '" & S & "' is not in " & Allowed
                        & ": not a known variant; requires a caller-supplied value");
            Add_Needs (C, Ptr,
                       "wrong enum value: " & S & " is not in " & Allowed
                       & ": not a known variant; requires a caller-supplied value",
                       "one of " & Allowed);
            return Create (S);
         end;
      end;
   end N_Enum;

   --  FILL array (missing/null -> []); wrong type -> needs-input.
   function N_Array (O : JSON_Value; Name, Ptr : String; C : in out N_Ctx) return JSON_Value is
   begin
      if not Has_Field (O, Name) or else Get (O, Name).Kind = JSON_Null_Type then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Create (Empty_Array),
                     "Missing required property " & Ptr & ": filled with canonical default []");
         return Create (Empty_Array);
      end if;
      declare V : constant JSON_Value := Get (O, Name); begin
         if V.Kind = JSON_Array_Type then return Clone (V); end if;
         Add_Needs (C, Ptr, "wrong type: expected an array", "an array value");
         return Clone (V);
      end;
   end N_Array;

   --  L1: notes are a string array; the legacy single string converts to a
   --  one-entry array ("" -> []).
   function N_Notes (O : JSON_Value; Name, Ptr : String; C : in out N_Ctx) return JSON_Value is
   begin
      if not Has_Field (O, Name) or else Get (O, Name).Kind = JSON_Null_Type then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Create (Empty_Array),
                     "Missing required property " & Ptr & ": filled with canonical default []");
         return Create (Empty_Array);
      end if;
      declare V : constant JSON_Value := Get (O, Name); begin
         if V.Kind = JSON_Array_Type then return Clone (V); end if;
         if V.Kind = JSON_String_Type then
            declare
               S : constant String := Str_Field (O, Name);
               A : JSON_Array := Empty_Array;
            begin
               if S /= "" then Append (A, Create (S)); end if;
               Add_Change (C, Ptr, "legacy conversion (L1)", Clone (V), Create (A),
                           "Legacy shape at " & Ptr
                           & ": converted per rule L1: notes string -> one-entry array");
               return Create (A);
            end;
         end if;
         Add_Needs (C, Ptr, "wrong type: expected an array of strings", "an array of strings");
         return Clone (V);
      end;
   end N_Notes;

   --  crewId: canonical empty = no crew link; non-empty must be a UUID.
   function N_Crew_Id (O : JSON_Value; Ptr : String; C : in out N_Ctx) return JSON_Value is
   begin
      if not Has_Field (O, "crewId") or else Get (O, "crewId").Kind = JSON_Null_Type then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Create (""),
                     "Missing required property " & Ptr & ": filled with canonical default """"");
         return Create ("");
      end if;
      declare V : constant JSON_Value := Get (O, "crewId"); begin
         if V.Kind = JSON_String_Type then
            declare S : constant String := Str_Field (O, "crewId"); begin
               if S = "" or else Is_Uuid (S) then return Create (S); end if;
               Add_Needs (C, Ptr, "wrong value: non-empty crewId must be a UUID",
                          "a UUID or empty string");
               return Create (S);
            end;
         end if;
         Add_Needs (C, Ptr, "wrong type: expected a string", "a UUID or empty string");
         return Clone (V);
      end;
   end N_Crew_Id;

   --  NEEDS-INPUT timestamps: no derivable value; the server stamps on
   --  apply (createdAt/updatedAt).
   function N_Timestamp (O : JSON_Value; Name, Ptr : String; C : in out N_Ctx) return JSON_Value is
   begin
      if Has_Field (O, Name) and then Get (O, Name).Kind = JSON_String_Type then
         return Clone (Get (O, Name));
      end if;
      Add_Needs (C, Ptr, "missing required property (no canonical default; server stamps on apply)",
                 "a caller-supplied ISO-8601 timestamp");
      return JSON_Null;
   end N_Timestamp;

   --  formatVersion: missing -> 1 (FILL, Q5); a present non-1 value is a
   --  future/unknown format and is rejected rather than rewritten.
   function N_Format_Version (O : JSON_Value; C : in out N_Ctx) return JSON_Value is
   begin
      if Has_Field (O, "formatVersion") and then Get (O, "formatVersion").Kind = JSON_Int_Type
        and then Int_Field (O, "formatVersion") = 1
      then
         return Create (Integer'(1));
      end if;
      if not Has_Field (O, "formatVersion") or else Get (O, "formatVersion").Kind = JSON_Null_Type then
         Add_Change (C, "/formatVersion", "missing/null fill", JSON_Null, Create (Integer'(1)),
                     "Missing required property /formatVersion: filled with canonical default 1");
         return Create (Integer'(1));
      end if;
      Add_Needs (C, "/formatVersion", "unknown format version; not normalized",
                 "format version 1");
      return Clone (Get (O, "formatVersion"));
   end N_Format_Version;

   --  FILL object with two empty strings (namedDescription).
   function N_Named_Desc (O : JSON_Value; Name, Ptr : String; C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, Name) or else Get (O, Name).Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, Name).Kind = JSON_Object_Type then
         Src := Get (O, Name);
         List_Removals (Src, Ptr, Allowed_Named_Desc, C);
      else
         Add_Needs (C, Ptr, "wrong type: expected an object",
                    "an object with name and description");
         Src := Create_Object;
      end if;
      Set_Field (X, "name", N_Str (Src, "name", Ptr & "/name", "", C));
      Set_Field (X, "description", N_Str (Src, "description", Ptr & "/description", "", C));
      if Missing then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property " & Ptr & ": filled with canonical empty object");
      end if;
      return X;
   end N_Named_Desc;

   --  Dossier vice: name/description empty; purveyor is the L4 legacy fill
   --  (the C# DossierVice has no purveyor).
   function N_Vice (O : JSON_Value; Name, Ptr : String; C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, Name) or else Get (O, Name).Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, Name).Kind = JSON_Object_Type then
         Src := Get (O, Name);
         List_Removals (Src, Ptr, Allowed_Vice, C);
      else
         Add_Needs (C, Ptr, "wrong type: expected an object",
                    "an object with name, description and purveyor");
         Src := Create_Object;
      end if;
      Set_Field (X, "name", N_Str (Src, "name", Ptr & "/name", "", C));
      Set_Field (X, "description", N_Str (Src, "description", Ptr & "/description", "", C));
      if Has_Field (Src, "purveyor") and then Get (Src, "purveyor").Kind /= JSON_Null_Type then
         if Get (Src, "purveyor").Kind = JSON_Object_Type then
            Set_Field (X, "purveyor", N_Named_Desc (Src, "purveyor", Ptr & "/purveyor", C));
         else
            Add_Needs (C, Ptr & "/purveyor", "wrong type: expected an object",
                       "an object with name and description");
            Set_Field (X, "purveyor", Clone (Get (Src, "purveyor")));
         end if;
      else
         declare P : JSON_Value := Create_Object; begin
            Set_Field (P, "name", Create (""));
            Set_Field (P, "description", Create (""));
            Add_Change (C, Ptr & "/purveyor", "legacy conversion (L4)", JSON_Null, Clone (P),
                        "Legacy shape at " & Ptr
                        & "/purveyor: converted per rule L4: missing purveyor filled with empty named description");
            Set_Field (X, "purveyor", P);
         end;
      end if;
      if Missing then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property " & Ptr & ": filled with canonical empty object");
      end if;
      return X;
   end N_Vice;

   --  FILL bounded-integer track {current: 0, max: settings-derived}.
   function N_Bounded (O : JSON_Value; Name, Ptr : String; S : Settings_Ref;
                       Key : String; Fallback : Integer; C : in out N_Ctx)
                      return JSON_Value
   is
      B : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, Name) or else Get (O, Name).Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, Name).Kind = JSON_Object_Type then
         Src := Get (O, Name);
         List_Removals (Src, Ptr, Allowed_Bounded, C);
      else
         Add_Needs (C, Ptr, "wrong type: expected an object",
                    "an object with current and max");
         Src := Create_Object;
      end if;
      Set_Field (B, "current", N_Int (Src, "current", Ptr & "/current", 0, C, Min => 0));
      Set_Field (B, "max", N_Int_Derived (Src, "max", Ptr & "/max", S, Key, Fallback, C));
      if Missing then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Clone (B),
                     "Missing required property " & Ptr & ": filled with canonical empty track");
      end if;
      return B;
   end N_Bounded;

   --  FILL experience track {points: 0, max: settings-derived}.
   function N_Experience (O : JSON_Value; Name, Ptr : String; S : Settings_Ref;
                          Key : String; Fallback : Integer; C : in out N_Ctx)
                         return JSON_Value
   is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, Name) or else Get (O, Name).Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, Name).Kind = JSON_Object_Type then
         Src := Get (O, Name);
         List_Removals (Src, Ptr, Allowed_Experience, C);
      else
         Add_Needs (C, Ptr, "wrong type: expected an object",
                    "an object with points and max");
         Src := Create_Object;
      end if;
      Set_Field (X, "points", N_Int (Src, "points", Ptr & "/points", 0, C, Min => 0));
      Set_Field (X, "max", N_Int_Derived (Src, "max", Ptr & "/max", S, Key, Fallback, C));
      if Missing then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property " & Ptr & ": filled with canonical empty track");
      end if;
      return X;
   end N_Experience;

   --  FILL embedded healing clock {segments: 0, size: settings-derived,
   --  rollover: 0}.
   function N_Healing_Clock (O : JSON_Value; Ptr : String; S : Settings_Ref;
                             C : in out N_Ctx) return JSON_Value
   is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, "healingClock") or else Get (O, "healingClock").Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, "healingClock").Kind = JSON_Object_Type then
         Src := Get (O, "healingClock");
         List_Removals (Src, Ptr, Allowed_Healing, C);
      else
         Add_Needs (C, Ptr, "wrong type: expected an object",
                    "an object with segments, size and rollover");
         Src := Create_Object;
      end if;
      Set_Field (X, "segments", N_Int (Src, "segments", Ptr & "/segments", 0, C, Min => 0));
      Set_Field (X, "size", N_Int_Derived (Src, "size", Ptr & "/size", S,
                                           "RecoveryClockSize", 4, C));
      Set_Field (X, "rollover", N_Int (Src, "rollover", Ptr & "/rollover", 0, C, Min => 0));
      if Missing then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property " & Ptr & ": filled with canonical empty clock");
      end if;
      return X;
   end N_Healing_Clock;

   --  L3: the C# trauma SortedSet serializes as an array; canonical storage
   --  is sorted and de-duplicated.
   function N_Trauma_Set (O : JSON_Value; Ptr : String; C : in out N_Ctx) return JSON_Value is
      Max_Items : constant := 256;
      Buf : array (1 .. Max_Items) of Unbounded_String := (others => Null_Unbounded_String);
      Cnt : Natural := 0;
   begin
      if not Has_Field (O, "traumas") or else Get (O, "traumas").Kind = JSON_Null_Type then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Create (Empty_Array),
                     "Missing required property " & Ptr & ": filled with canonical default []");
         return Create (Empty_Array);
      end if;
      declare V : constant JSON_Value := Get (O, "traumas"); begin
         if V.Kind /= JSON_Array_Type then
            Add_Needs (C, Ptr, "wrong type: expected an array of strings", "an array of strings");
            return Clone (V);
         end if;
      end;
      declare
         A : constant JSON_Array := Get (O, "traumas");
         V : constant JSON_Value := Get (O, "traumas");
      begin
         for I in 1 .. Length (A) loop
            declare
               Item : constant JSON_Value := Get (A, I);
            begin
               if Item.Kind /= JSON_String_Type then
                  Add_Needs (C, Ptr & "/" & Trim_Image (I - 1),
                             "wrong type: expected a string", "a string item");
               else
                  declare
                     S : constant String := String'(Get (Item));
                     Dup : Boolean := False;
                  begin
                     --  de-duplicate (keep first occurrence)
                     for J in 1 .. Cnt loop
                        if To_String (Buf (J)) = S then Dup := True; exit; end if;
                     end loop;
                     if not Dup and then Cnt < Max_Items then
                        Cnt := Cnt + 1;
                        Buf (Cnt) := To_Unbounded_String (S);
                     end if;
                  end;
               end if;
            end;
         end loop;
         --  sort deterministically
         for I in 1 .. Cnt - 1 loop
            for J in I + 1 .. Cnt loop
               if To_String (Buf (J)) < To_String (Buf (I)) then
                  declare T : constant Unbounded_String := Buf (I); begin
                     Buf (I) := Buf (J);
                     Buf (J) := T;
                  end;
               end if;
            end loop;
         end loop;
         --  identical to the stored array?  (same length, same order)
         declare
            Same : Boolean := Length (A) = Cnt;
            O2 : JSON_Array := Empty_Array;
         begin
            if Same then
               for I in 1 .. Cnt loop
                  if To_String (Buf (I)) /= String'(Get (Get (A, I))) then Same := False; exit; end if;
               end loop;
            end if;
            for I in 1 .. Cnt loop Append (O2, Create (To_String (Buf (I)))); end loop;
            if not Same then
               Add_Change (C, Ptr, "legacy conversion (L3)", Clone (V), Create (O2),
                           "Legacy shape at " & Ptr
                           & ": converted per rule L3: trauma set sorted and de-duplicated");
            end if;
            return Create (O2);
         end;
      end;
   end N_Trauma_Set;

   --  FILL trauma track {traumas: [] (L3 SortedSet: sorted, de-duplicated),
   --  max: settings-derived}.
   function N_Traumas (O : JSON_Value; Ptr : String; S : Settings_Ref;
                       C : in out N_Ctx) return JSON_Value
   is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, "trauma") or else Get (O, "trauma").Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, "trauma").Kind = JSON_Object_Type then
         Src := Get (O, "trauma");
         List_Removals (Src, Ptr, Allowed_Trauma, C);
      else
         Add_Needs (C, Ptr, "wrong type: expected an object",
                    "an object with traumas and max");
         Src := Create_Object;
      end if;
      Set_Field (X, "traumas", N_Trauma_Set (Src, Ptr & "/traumas", C));
      Set_Field (X, "max", N_Int_Derived (Src, "max", Ptr & "/max", S, "TraumaMax", 4, C));
      if Missing then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property " & Ptr & ": filled with canonical empty track");
      end if;
      return X;
   end N_Traumas;

   --  L3: C# dictionary {name: item} -> canonical array with a "name"
   --  member; keys sorted, item fields copied with C# field-name aliases.
   function Dict_To_Array (V : JSON_Value; Ptr : String; C : in out N_Ctx) return JSON_Array is
      K : Key_Buffer;
      N : Natural;
      A : JSON_Array := Empty_Array;
   begin
      Collect_Keys (V, K, N);
      Sort_Keys (K, N);
      for I in 1 .. N loop
         declare
            Name : constant String := To_String (K (I));
            Src  : constant JSON_Value := Get (V, Name);
            Item : JSON_Value := Create_Object;
         begin
            if Src.Kind = JSON_Object_Type then
               for M in Item_Field_Aliases'Range loop
                  declare
                     CN : constant String := To_String (Item_Field_Aliases (M).Canon);
                     AN : constant String := To_String (Item_Field_Aliases (M).Alt);
                  begin
                     if Has_Field (Src, CN) then
                        Set_Field (Item, CN, Clone (Get (Src, CN)));
                     elsif AN /= "" and then Has_Field (Src, AN) then
                        Set_Field (Item, CN, Clone (Get (Src, AN)));
                     end if;
                  end;
               end loop;
            end if;
            Set_Field (Item, "name", Name);
            Append (A, Item);
         end;
      end loop;
      Add_Change (C, Ptr, "legacy conversion (L3)", Clone (V), Create (A),
                  "Legacy shape at " & Ptr
                  & ": converted per rule L3: dictionary -> array with name member (sorted by key)");
      return A;
   end Dict_To_Array;

   --  Item walker signature for array properties.
   type Item_Walker is access function
     (V : JSON_Value; Ptr : String; S : Settings_Ref; C : in out N_Ctx)
      return JSON_Value;

   function Items_Walked (A : JSON_Array; Ptr : String; S : Settings_Ref;
                          C : in out N_Ctx; Walk : Item_Walker) return JSON_Value
   is
      O : JSON_Array := Empty_Array;
   begin
      for I in 1 .. Length (A) loop
         declare
            V : constant JSON_Value := Get (A, I);
            P : constant String := Ptr & "/" & Trim_Image (I - 1);
         begin
            if V.Kind = JSON_Object_Type then
               Append (O, Walk (V, P, S, C));
            else
               Add_Needs (C, P, "wrong type: expected an object", "an object item");
               Append (O, Clone (V));
            end if;
         end;
      end loop;
      return Create (O);
   end Items_Walked;

   --  Shared array-property canonicalizer: missing -> [] fill; legacy
   --  dictionary (L3) or the legacy-named property -> converted; arrays
   --  walk their items.
   function N_Items (O : JSON_Value; Name, Legacy_Name, Ptr : String;
                     S : Settings_Ref; C : in out N_Ctx; Walk : Item_Walker;
                     L6 : Boolean := False)
                    return JSON_Value
   is
      Src : JSON_Value := JSON_Null;
      Used_Legacy : Boolean := False;
   begin
      if Has_Field (O, Name) and then Get (O, Name).Kind /= JSON_Null_Type then
         Src := Get (O, Name);
      elsif Legacy_Name /= "" and then Has_Field (O, Legacy_Name)
        and then Get (O, Legacy_Name).Kind /= JSON_Null_Type
      then
         Src := Get (O, Legacy_Name);
         Used_Legacy := True;
      end if;
      if Src.Kind = JSON_Null_Type then
         if L6 then
            --  C3-era crews lack contacts/factions (L6): the fill is a
            --  documented legacy conversion, not a plain missing-key fill.
            Add_Change (C, Ptr, "legacy conversion (L6)", JSON_Null, Create (Empty_Array),
                        "Legacy shape at " & Ptr
                        & ": converted per rule L6: missing " & Name & " filled with empty array");
         else
            Add_Change (C, Ptr, "missing/null fill", JSON_Null, Create (Empty_Array),
                        "Missing required property " & Ptr & ": filled with canonical default []");
         end if;
         return Create (Empty_Array);
      end if;
      if Src.Kind = JSON_Object_Type then
         return Items_Walked (Dict_To_Array (Src, Ptr, C), Ptr, S, C, Walk);
      end if;
      if Src.Kind = JSON_Array_Type then
         if Used_Legacy then
            Add_Change (C, Ptr, "legacy conversion (L3)", Clone (Src), Clone (Src),
                        "Legacy shape at " & Ptr & ": converted per rule L3: renamed property "
                        & Legacy_Name & " -> " & Name);
         end if;
         return Items_Walked (Get (O, (if Used_Legacy then Legacy_Name else Name)),
                              Ptr, S, C, Walk);
      end if;
      Add_Needs (C, Ptr, "wrong type: expected an array", "an array value");
      return Clone (Src);
   end N_Items;

   --  Character array items -------------------------------------------------

   function Ability_Item (V : JSON_Value; Ptr : String; S : Settings_Ref;
                          C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      List_Removals (V, Ptr, Allowed_Ability, C);
      Set_Field (X, "name", N_Str (V, "name", Ptr & "/name", "", C));
      Set_Field (X, "description", N_Str (V, "description", Ptr & "/description", "", C));
      Set_Field (X, "timesTaken", N_Min1 (V, "timesTaken", Ptr & "/timesTaken", C));
      return X;
   end Ability_Item;

   function Action_Item (V : JSON_Value; Ptr : String; S : Settings_Ref;
                         C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      List_Removals (V, Ptr, Allowed_Action, C);
      Set_Field (X, "name", N_Str (V, "name", Ptr & "/name", "", C));
      Set_Field (X, "rating", N_Int (V, "rating", Ptr & "/rating", 0, C, Min => 0));
      Set_Field (X, "maxRating",
                 N_Int_Derived (V, "maxRating", Ptr & "/maxRating", S,
                                "ActionPointMaximum", 4, C));
      return X;
   end Action_Item;

   function Attribute_Item (V : JSON_Value; Ptr : String; S : Settings_Ref;
                            C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      List_Removals (V, Ptr, Allowed_Attribute, C);
      Set_Field (X, "name", N_Str (V, "name", Ptr & "/name", "", C));
      Set_Field (X, "experience", N_Experience (V, "experience", Ptr & "/experience", S,
                                                "XpTrackMaxima.Attribute", 6, C));
      Set_Field (X, "actions", N_Items (V, "actions", "actionsByName",
                                        Ptr & "/actions", S, C, Action_Item'Access));
      return X;
   end Attribute_Item;

   function Gear_Item (V : JSON_Value; Ptr : String; S : Settings_Ref;
                       C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      List_Removals (V, Ptr, Allowed_Gear_Item, C);
      Set_Field (X, "name", N_Str_Required (V, "name", Ptr & "/name", C));
      Set_Field (X, "bulk", N_Int (V, "bulk", Ptr & "/bulk", 0, C, Min => 0));
      return X;
   end Gear_Item;

   function Friend_Item (V : JSON_Value; Ptr : String; S : Settings_Ref;
                         C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      List_Removals (V, Ptr, Allowed_Friend, C);
      Set_Field (X, "entry", N_Str_Required (V, "entry", Ptr & "/entry", C));
      Set_Field (X, "closeness", N_Enum (V, "closeness", Ptr & "/closeness", C,
                                         "|friend|close-friend|rival|",
                                         Closeness_Legacy));
      return X;
   end Friend_Item;

   --  Crew array items ------------------------------------------------------

   function Spec_Ability_Item (V : JSON_Value; Ptr : String; S : Settings_Ref;
                               C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      List_Removals (V, Ptr, Allowed_Spec_Ability, C);
      Set_Field (X, "name", N_Str_Required (V, "name", Ptr & "/name", C));
      Set_Field (X, "timesTaken", N_Min1 (V, "timesTaken", Ptr & "/timesTaken", C));
      return X;
   end Spec_Ability_Item;

   function Upgrade_Item (V : JSON_Value; Ptr : String; S : Settings_Ref;
                          C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      List_Removals (V, Ptr, Allowed_Upgrade, C);
      Set_Field (X, "name", N_Str_Required (V, "name", Ptr & "/name", C));
      Set_Field (X, "boxesMarked", N_Min1 (V, "boxesMarked", Ptr & "/boxesMarked", C));
      return X;
   end Upgrade_Item;

   function Cohort_Item (V : JSON_Value; Ptr : String; S : Settings_Ref;
                         C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      List_Removals (V, Ptr, Allowed_Cohort, C);
      --  identity: cohort ids are server-generated; a missing or invalid id
      --  gets a fresh UUID as a previewed fill (no schema references them).
      if Has_Field (V, "id") and then Get (V, "id").Kind = JSON_String_Type
        and then Is_Uuid (Str_Field (V, "id"))
      then
         Set_Field (X, "id", Clone (Get (V, "id")));
      else
         declare Nid : constant String := New_Id; begin
            Add_Change (C, Ptr & "/id", "identity normalization",
                        (if Has_Field (V, "id") then Get (V, "id") else JSON_Null),
                        Create (Nid),
                        "Missing or invalid cohort id at " & Ptr
                        & "/id: filled with server-generated UUID " & Nid);
            Set_Field (X, "id", Create (Nid));
         end;
      end if;
      Set_Field (X, "cohortKind", N_Enum (V, "cohortKind", Ptr & "/cohortKind", C,
                                          "|gang|expert|", Cohort_Type_Legacy));
      Set_Field (X, "gangType", N_Str (V, "gangType", Ptr & "/gangType", "", C));
      Set_Field (X, "expertType", N_Str (V, "expertType", Ptr & "/expertType", "", C));
      Set_Field (X, "quality", N_Int (V, "quality", Ptr & "/quality", 0, C, Min => 0));
      Set_Field (X, "scale", N_Int (V, "scale", Ptr & "/scale", 0, C, Min => 0));
      Set_Field (X, "hasArmor", N_Bool (V, "hasArmor", Ptr & "/hasArmor", C));
      Set_Field (X, "edges", N_Array (V, "edges", Ptr & "/edges", C));
      Set_Field (X, "flaws", N_Array (V, "flaws", Ptr & "/flaws", C));
      Set_Field (X, "harm", N_Enum (V, "harm", Ptr & "/harm", C,
                                    "|healthy|weakened|impaired|broken|dead|",
                                    Cohort_Harm_Legacy, Default => "healthy"));
      Set_Field (X, "description", N_Str (V, "description", Ptr & "/description", "", C));
      return X;
   end Cohort_Item;

   function Contact_Item (V : JSON_Value; Ptr : String; S : Settings_Ref;
                          C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      List_Removals (V, Ptr, Allowed_Contact, C);
      Set_Field (X, "name", N_Str_Required (V, "name", Ptr & "/name", C));
      Set_Field (X, "profession", N_Str (V, "profession", Ptr & "/profession", "", C));
      return X;
   end Contact_Item;

   function N_Faction_Status (O : JSON_Value; Ptr : String; S : Settings_Ref;
                              C : in out N_Ctx) return JSON_Value is
      Lo, Hi : Integer;
   begin
      Lo := Integer'First;
      Hi := Integer'Last;
      if S.G.Kind = JSON_Object_Type and then Has_Field (S.G, "FactionStatus") then
         declare FS : constant JSON_Value := Get (S.G, "FactionStatus"); begin
            if Has_Field (FS, "Min") and then Get (FS, "Min").Kind = JSON_Int_Type then
               Lo := Int_Field (FS, "Min", Integer'First);
            end if;
            if Has_Field (FS, "Max") and then Get (FS, "Max").Kind = JSON_Int_Type then
               Hi := Int_Field (FS, "Max", Integer'Last);
            end if;
         end;
      end if;
      return N_Int (O, "status", Ptr, 0, C, Min => Lo, Max => Hi);
   end N_Faction_Status;

   function Faction_Item (V : JSON_Value; Ptr : String; S : Settings_Ref;
                          C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      List_Removals (V, Ptr, Allowed_Faction, C);
      Set_Field (X, "name", N_Str_Required (V, "name", Ptr & "/name", C));
      Set_Field (X, "status", N_Faction_Status (V, Ptr & "/status", S, C));
      return X;
   end Faction_Item;

   --  Sparse overlay items (Q2/Q3): only claimId is required; absent
   --  name/description/effects mean "inherit the canonical game-setting
   --  value" and are never filled.
   function Override_Item (V : JSON_Value; Ptr : String; S : Settings_Ref;
                           C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      List_Removals (V, Ptr, Allowed_Override, C);
      if Has_Field (V, "claimId") and then Get (V, "claimId").Kind = JSON_String_Type
        and then Is_Claim_Id (Str_Field (V, "claimId"))
      then
         Set_Field (X, "claimId", Create (Str_Field (V, "claimId")));
      else
         Add_Needs (C, Ptr & "/claimId",
                    "missing or invalid claimId (cannot guess which claim is overridden)",
                    "a claim id matching ^[a-z0-9]+(?:-[a-z0-9]+)*$");
         Set_Field (X, "claimId",
                    (if Has_Field (V, "claimId") then Clone (Get (V, "claimId")) else JSON_Null));
      end if;
      --  SPARSE name/description: absent = inherit (never filled); present
      --  but empty violates minLength 1 -> needs-input; null is never
      --  stored and drops back to absent.
      if Has_Field (V, "name") then
         if Get (V, "name").Kind = JSON_String_Type then
            if Str_Field (V, "name") /= "" then
               Set_Field (X, "name", Create (Str_Field (V, "name")));
            else
               Add_Needs (C, Ptr & "/name", "present but empty override name",
                          "a non-empty string or absent (inherit)");
            end if;
         elsif Get (V, "name").Kind /= JSON_Null_Type then
            Add_Needs (C, Ptr & "/name", "wrong type: expected a string",
                       "a non-empty string or absent (inherit)");
         end if;
      end if;
      if Has_Field (V, "description") then
         if Get (V, "description").Kind = JSON_String_Type then
            if Str_Field (V, "description") /= "" then
               Set_Field (X, "description", Create (Str_Field (V, "description")));
            else
               Add_Needs (C, Ptr & "/description", "present but empty override description",
                          "a non-empty string or absent (inherit)");
            end if;
         elsif Get (V, "description").Kind /= JSON_Null_Type then
            Add_Needs (C, Ptr & "/description", "wrong type: expected a string",
                       "a non-empty string or absent (inherit)");
         end if;
      end if;
      --  SPARSE effects: absent = inherit; a present array (even empty) is
      --  semantically distinct and preserved as-is.
      if Has_Field (V, "effects") and then Get (V, "effects").Kind /= JSON_Null_Type then
         if Get (V, "effects").Kind = JSON_Array_Type then
            Set_Field (X, "effects", Clone (Get (V, "effects")));
         else
            Add_Needs (C, Ptr & "/effects", "wrong type: expected an array",
                       "an array or absent (inherit)");
         end if;
      end if;
      return X;
   end Override_Item;

   --  claimedClaimIds: claim-id pattern items, de-duplicated (uniqueItems).
   function N_Claimed_Ids (O : JSON_Value; Ptr : String; C : in out N_Ctx) return JSON_Value is
   begin
      if not Has_Field (O, "claimedClaimIds") or else Get (O, "claimedClaimIds").Kind = JSON_Null_Type then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Create (Empty_Array),
                     "Missing required property " & Ptr & ": filled with canonical default []");
         return Create (Empty_Array);
      end if;
      declare V : constant JSON_Value := Get (O, "claimedClaimIds"); begin
         if V.Kind /= JSON_Array_Type then
            Add_Needs (C, Ptr, "wrong type: expected an array", "an array of claim ids");
            return Clone (V);
         end if;
      end;
      declare
         A : constant JSON_Array := Get (O, "claimedClaimIds");
         V : constant JSON_Value := Get (O, "claimedClaimIds");
         O2 : JSON_Array := Empty_Array;
         Dropped : Boolean := False;
      begin
         for I in 1 .. Length (A) loop
            declare
               Item : constant JSON_Value := Get (A, I);
               P : constant String := Ptr & "/" & Trim_Image (I - 1);
            begin
               if Item.Kind /= JSON_String_Type then
                  Add_Needs (C, P, "wrong type: expected a string", "a claim id");
                  Append (O2, Clone (Item));
               else
                  declare S : constant String := String'(Get (Item)); begin
                  if not Is_Claim_Id (S) then
                     Add_Needs (C, P, "wrong value: not a claim id",
                                "a claim id matching ^[a-z0-9]+(?:-[a-z0-9]+)*$");
                     Append (O2, Create (S));
                  else
                     declare Dup : Boolean := False; begin
                        for J in 1 .. Length (O2) loop
                           if String'(Get (Get (O2, J))) = S then Dup := True; exit; end if;
                        end loop;
                        if Dup then Dropped := True;
                        else Append (O2, Create (S));
                        end if;
                     end;
                  end if;
                  end;
               end if;
            end;
         end loop;
         if Dropped then
            Add_Change (C, Ptr, "uniqueItems", Clone (V), Create (O2),
                        "Property " & Ptr & " contains duplicate items: de-duplicated");
         end if;
         return Create (O2);
      end;
   end N_Claimed_Ids;

   --  Entity walkers --------------------------------------------------------

   function N_Dossier (O : JSON_Value; C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, "dossier") or else Get (O, "dossier").Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, "dossier").Kind = JSON_Object_Type then
         Src := Get (O, "dossier");
         List_Removals (Src, "/dossier", Allowed_Dossier, C);
      else
         Add_Needs (C, "/dossier", "wrong type: expected an object", "an object");
         Src := Create_Object;
      end if;
      Set_Field (X, "name", N_Str (Src, "name", "/dossier/name", "", C));
      Set_Field (X, "crewId", N_Crew_Id (Src, "/dossier/crewId", C));
      Set_Field (X, "alias", N_Str (Src, "alias", "/dossier/alias", "", C));
      Set_Field (X, "look", N_Str (Src, "look", "/dossier/look", "", C));
      Set_Field (X, "notes", N_Notes (Src, "notes", "/dossier/notes", C));
      Set_Field (X, "background", N_Named_Desc (Src, "background", "/dossier/background", C));
      Set_Field (X, "heritage", N_Named_Desc (Src, "heritage", "/dossier/heritage", C));
      Set_Field (X, "vice", N_Vice (Src, "vice", "/dossier/vice", C));
      if Missing then
         Add_Change (C, "/dossier", "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property /dossier: filled with canonical empty dossier");
      end if;
      return X;
   end N_Dossier;

   function N_Harm (O : JSON_Value; S : Settings_Ref; C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, "harm") or else Get (O, "harm").Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, "harm").Kind = JSON_Object_Type then
         Src := Get (O, "harm");
         List_Removals (Src, "/monitor/harm", Allowed_Harm, C);
      else
         Add_Needs (C, "/monitor/harm", "wrong type: expected an object", "an object");
         Src := Create_Object;
      end if;
      Set_Field (X, "lesser", N_Array (Src, "lesser", "/monitor/harm/lesser", C));
      Set_Field (X, "moderate", N_Array (Src, "moderate", "/monitor/harm/moderate", C));
      Set_Field (X, "severe", N_Array (Src, "severe", "/monitor/harm/severe", C));
      Set_Field (X, "fatal", N_Array (Src, "fatal", "/monitor/harm/fatal", C));
      Set_Field (X, "healingClock", N_Healing_Clock (Src, "/monitor/harm/healingClock", S, C));
      if Missing then
         Add_Change (C, "/monitor/harm", "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property /monitor/harm: filled with canonical empty harm");
      end if;
      return X;
   end N_Harm;

   function N_Armor (O : JSON_Value; C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, "armor") or else Get (O, "armor").Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, "armor").Kind = JSON_Object_Type then
         Src := Get (O, "armor");
         List_Removals (Src, "/monitor/armor", Allowed_Armor, C);
      else
         Add_Needs (C, "/monitor/armor", "wrong type: expected an object", "an object");
         Src := Create_Object;
      end if;
      Set_Field (X, "standardUsed", N_Bool (Src, "standardUsed", "/monitor/armor/standardUsed", C));
      Set_Field (X, "heavyUsed", N_Bool (Src, "heavyUsed", "/monitor/armor/heavyUsed", C));
      Set_Field (X, "specialUsed", N_Bool (Src, "specialUsed", "/monitor/armor/specialUsed", C));
      Set_Field (X, "hasStandard", N_Bool (Src, "hasStandard", "/monitor/armor/hasStandard", C));
      Set_Field (X, "hasHeavy", N_Bool (Src, "hasHeavy", "/monitor/armor/hasHeavy", C));
      Set_Field (X, "hasSpecial", N_Bool (Src, "hasSpecial", "/monitor/armor/hasSpecial", C));
      if Missing then
         Add_Change (C, "/monitor/armor", "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property /monitor/armor: filled with canonical empty armor");
      end if;
      return X;
   end N_Armor;

   function N_Monitor (O : JSON_Value; S : Settings_Ref; C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, "monitor") or else Get (O, "monitor").Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, "monitor").Kind = JSON_Object_Type then
         Src := Get (O, "monitor");
         List_Removals (Src, "/monitor", Allowed_Monitor, C);
      else
         Add_Needs (C, "/monitor", "wrong type: expected an object", "an object");
         Src := Create_Object;
      end if;
      Set_Field (X, "stress", N_Bounded (Src, "stress", "/monitor/stress", S, "StressMax", 9, C));
      Set_Field (X, "trauma", N_Traumas (Src, "/monitor/trauma", S, C));
      Set_Field (X, "harm", N_Harm (Src, S, C));
      Set_Field (X, "armor", N_Armor (Src, C));
      if Missing then
         Add_Change (C, "/monitor", "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property /monitor: filled with canonical empty monitor");
      end if;
      return X;
   end N_Monitor;

   function N_Talent (O : JSON_Value; S : Settings_Ref; C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, "talent") or else Get (O, "talent").Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, "talent").Kind = JSON_Object_Type then
         Src := Get (O, "talent");
         List_Removals (Src, "/talent", Allowed_Talent, C);
      else
         Add_Needs (C, "/talent", "wrong type: expected an object", "an object");
         Src := Create_Object;
      end if;
      Set_Field (X, "attributes", N_Items (Src, "attributes", "attributesByName",
                                           "/talent/attributes", S, C, Attribute_Item'Access));
      if Missing then
         Add_Change (C, "/talent", "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property /talent: filled with canonical empty talent");
      end if;
      return X;
   end N_Talent;

   function N_Playbook (O : JSON_Value; S : Settings_Ref; C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, "playbook") or else Get (O, "playbook").Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, "playbook").Kind = JSON_Object_Type then
         Src := Get (O, "playbook");
         List_Removals (Src, "/playbook", Allowed_Playbook, C);
      else
         Add_Needs (C, "/playbook", "wrong type: expected an object", "an object");
         Src := Create_Object;
      end if;
      Set_Field (X, "name", N_Str (Src, "name", "/playbook/name", "", C));
      Set_Field (X, "experience", N_Experience (Src, "experience", "/playbook/experience", S,
                                                "XpTrackMaxima.Playbook", 8, C));
      Set_Field (X, "abilities", N_Items (Src, "abilities", "abilitiesByName",
                                          "/playbook/abilities", S, C, Ability_Item'Access));
      if Missing then
         Add_Change (C, "/playbook", "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property /playbook: filled with canonical empty playbook");
      end if;
      return X;
   end N_Playbook;

   --  gear.maxBulk derives from the commitment level (C# LoadCommitmentOption).
   function Commitment_Max_Bulk (S : Settings_Ref; Commitment : String) return Integer is
   begin
      if S.G.Kind = JSON_Object_Type and then Has_Field (S.G, "LoadMaxima") then
         declare L : constant JSON_Value := Get (S.G, "LoadMaxima"); begin
            if Has_Field (L, "CommitmentMaxBulk") then
               declare M : constant JSON_Value := Get (L, "CommitmentMaxBulk"); begin
                  if Commitment = "none" then return 0;
                  elsif Commitment = "light" then return Int_Field (M, "Light", 3);
                  elsif Commitment = "normal" then return Int_Field (M, "Normal", 5);
                  elsif Commitment = "heavy" then return Int_Field (M, "Heavy", 6);
                  elsif Commitment = "encumbered" then return Int_Field (M, "Encumbered", 9);
                  end if;
               end;
            end if;
         end;
      end if;
      if Commitment = "none" then return 0;
      elsif Commitment = "light" then return 3;
      elsif Commitment = "normal" then return 5;
      elsif Commitment = "heavy" then return 6;
      else return 9;
      end if;
   end Commitment_Max_Bulk;

   function N_Gear (O : JSON_Value; S : Settings_Ref; C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
      Commit : Unbounded_String := Null_Unbounded_String;
   begin
      if not Has_Field (O, "gear") or else Get (O, "gear").Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, "gear").Kind = JSON_Object_Type then
         Src := Get (O, "gear");
         List_Removals (Src, "/gear", Allowed_Gear, C);
      else
         Add_Needs (C, "/gear", "wrong type: expected an object", "an object");
         Src := Create_Object;
      end if;
      Set_Field (X, "loadout", N_Items (Src, "loadout", "loadoutByName",
                                        "/gear/loadout", S, C, Gear_Item'Access));
      Set_Field (X, "availableGear", N_Items (Src, "availableGear", "availableGearByName",
                                              "/gear/availableGear", S, C, Gear_Item'Access));
      declare CV : constant JSON_Value := N_Enum (Src, "commitment", "/gear/commitment", C,
                                                  "|none|light|normal|heavy|encumbered|",
                                                  Commitment_Legacy, Default => "none"); begin
         if CV.Kind = JSON_String_Type then
            Commit := To_Unbounded_String (String'(Get (CV)));
         end if;
         Set_Field (X, "commitment", CV);
      end;
      Set_Field (X, "isCommitmentLocked",
                 N_Bool (Src, "isCommitmentLocked", "/gear/isCommitmentLocked", C));
      if Has_Field (Src, "maxBulk") and then Get (Src, "maxBulk").Kind /= JSON_Null_Type then
         Set_Field (X, "maxBulk",
                    N_Int_Derived (Src, "maxBulk", "/gear/maxBulk", S,
                                   "LoadMaxima.MaxBulk", 9, C));
      elsif To_String (Commit) = "none" or else To_String (Commit) = "light"
        or else To_String (Commit) = "normal" or else To_String (Commit) = "heavy"
        or else To_String (Commit) = "encumbered"
      then
         declare Val : constant Integer := Commitment_Max_Bulk (S, To_String (Commit)); begin
            Add_Change (C, "/gear/maxBulk", "derived fill", JSON_Null, Create (Val),
                        "Missing required property /gear/maxBulk: filled with commitment-derived default "
                        & Trim_Image (Val));
            Set_Field (X, "maxBulk", Create (Val));
         end;
      else
         Add_Needs (C, "/gear/maxBulk",
                    "missing required property (commitment unresolved)",
                    "a caller-supplied value");
         Set_Field (X, "maxBulk", JSON_Null);
      end if;
      if Missing then
         Add_Change (C, "/gear", "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property /gear: filled with canonical empty gear");
      end if;
      return X;
   end N_Gear;

   function N_Satchel (O : JSON_Value; Name, Ptr : String; S : Settings_Ref;
                       Key : String; Fallback : Integer; C : in out N_Ctx)
                      return JSON_Value
   is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, Name) or else Get (O, Name).Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, Name).Kind = JSON_Object_Type then
         Src := Get (O, Name);
         List_Removals (Src, Ptr, Allowed_Satchel, C);
      else
         Add_Needs (C, Ptr, "wrong type: expected an object",
                    "an object with coins and max");
         Src := Create_Object;
      end if;
      Set_Field (X, "coins", N_Int (Src, "coins", Ptr & "/coins", 0, C, Min => 0));
      Set_Field (X, "max", N_Int_Derived (Src, "max", Ptr & "/max", S, Key, Fallback, C));
      if Missing then
         Add_Change (C, Ptr, "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property " & Ptr & ": filled with canonical empty fund");
      end if;
      return X;
   end N_Satchel;

   function N_Fund (O : JSON_Value; S : Settings_Ref; C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, "fund") or else Get (O, "fund").Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, "fund").Kind = JSON_Object_Type then
         Src := Get (O, "fund");
         List_Removals (Src, "/fund", Allowed_Fund, C);
      else
         Add_Needs (C, "/fund", "wrong type: expected an object", "an object");
         Src := Create_Object;
      end if;
      Set_Field (X, "satchel", N_Satchel (Src, "satchel", "/fund/satchel", S,
                                          "FundMaxima.SatchelMax", 4, C));
      Set_Field (X, "stash", N_Satchel (Src, "stash", "/fund/stash", S,
                                        "FundMaxima.StashMax", 40, C));
      if Missing then
         Add_Change (C, "/fund", "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property /fund: filled with canonical empty fund");
      end if;
      return X;
   end N_Fund;

   function N_Rolodex (O : JSON_Value; C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
      No_Settings : Settings_Ref;
   begin
      if not Has_Field (O, "rolodex") or else Get (O, "rolodex").Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, "rolodex").Kind = JSON_Object_Type then
         Src := Get (O, "rolodex");
         List_Removals (Src, "/rolodex", Allowed_Rolodex, C);
      else
         Add_Needs (C, "/rolodex", "wrong type: expected an object", "an object");
         Src := Create_Object;
      end if;
      Set_Field (X, "friends", N_Items (Src, "friends", "", "/rolodex/friends",
                                        No_Settings, C, Friend_Item'Access));
      if Missing then
         Add_Change (C, "/rolodex", "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property /rolodex: filled with canonical empty rolodex");
      end if;
      return X;
   end N_Rolodex;

   function N_Session (O : JSON_Value; S : Settings_Ref; C : in out N_Ctx) return JSON_Value is
      X : JSON_Value := Create_Object;
      Src : JSON_Value;
      Missing : Boolean := False;
   begin
      if not Has_Field (O, "session") or else Get (O, "session").Kind = JSON_Null_Type then
         Missing := True; Src := Create_Object;
      elsif Get (O, "session").Kind = JSON_Object_Type then
         Src := Get (O, "session");
         List_Removals (Src, "/session", Allowed_Session, C);
      else
         Add_Needs (C, "/session", "wrong type: expected an object", "an object");
         Src := Create_Object;
      end if;
      Set_Field (X, "playbookExpressions",
                 N_Int (Src, "playbookExpressions", "/session/playbookExpressions", 0, C, Min => 0));
      Set_Field (X, "characterExpressions",
                 N_Int (Src, "characterExpressions", "/session/characterExpressions", 0, C, Min => 0));
      Set_Field (X, "struggleExpressions",
                 N_Int (Src, "struggleExpressions", "/session/struggleExpressions", 0, C, Min => 0));
      Set_Field (X, "max", N_Int_Derived (Src, "max", "/session/max", S,
                                          "SessionExpressionMax", 2, C));
      if Missing then
         Add_Change (C, "/session", "missing/null fill", JSON_Null, Clone (X),
                     "Missing required property /session: filled with canonical empty session");
      end if;
      return X;
   end N_Session;

   function Canonicalize_Character
     (V : JSON_Value; Kind, Id : String; C : in out N_Ctx) return JSON_Value
   is
      O : JSON_Value := Create_Object;
      Stem : Unbounded_String := Null_Unbounded_String;
      S : Settings_Ref;
      G_Name : Unbounded_String := Null_Unbounded_String;
   begin
      List_Removals (V, "", Allowed_Character, C);
      --  identity (Q15): kind/id come from the route
      if Has_Field (V, "kind") and then Get (V, "kind").Kind = JSON_String_Type
        and then Str_Field (V, "kind") = Kind
      then
         Set_Field (O, "kind", Kind);
      else
         Add_Change (C, "/kind", "identity normalization",
                     (if Has_Field (V, "kind") then Get (V, "kind") else JSON_Null),
                     Create (Kind),
                     "Body kind does not match route " & Kind
                     & ": normalized to route identity (directory is authoritative)");
         Set_Field (O, "kind", Kind);
      end if;
      if Has_Field (V, "id") and then Get (V, "id").Kind = JSON_String_Type
        and then Str_Field (V, "id") = Id
      then
         Set_Field (O, "id", Id);
      else
         Add_Change (C, "/id", "identity normalization",
                     (if Has_Field (V, "id") then Get (V, "id") else JSON_Null),
                     Create (Id),
                     "Body id does not match route " & Id
                     & ": normalized to route identity (directory is authoritative)");
         Set_Field (O, "id", Id);
      end if;
      --  gameStem: campaign-derived fill when missing; invalid pattern is
      --  needs-input; all DERIVED fills depend on it.
      if Has_Field (V, "gameStem") and then Get (V, "gameStem").Kind = JSON_String_Type
        and then Valid_Stem (Str_Field (V, "gameStem"))
      then
         Stem := To_Unbounded_String (Str_Field (V, "gameStem"));
         Set_Field (O, "gameStem", Create (To_String (Stem)));
      elsif not Has_Field (V, "gameStem") or else Get (V, "gameStem").Kind = JSON_Null_Type then
         declare CS : constant String := Campaign_Stem; begin
            if CS /= "" then
               Stem := To_Unbounded_String (CS);
               Add_Change (C, "/gameStem", "derived fill", JSON_Null, Create (CS),
                           "Missing required property /gameStem: filled with campaign-derived default "
                           & CS);
               Set_Field (O, "gameStem", Create (CS));
            else
               Add_Needs (C, "/gameStem", "missing required property (no campaign context)",
                          "a caller-supplied value");
               Set_Field (O, "gameStem", JSON_Null);
            end if;
         end;
      else
         Add_Needs (C, "/gameStem", "wrong gameStem value",
                    "a value matching ^[A-Za-z0-9-]+$");
         Set_Field (O, "gameStem", Clone (Get (V, "gameStem")));
      end if;
      S := (To_Unbounded_String (To_String (Stem)), Game (To_String (Stem)));
      if S.G.Kind = JSON_Object_Type then
         G_Name := To_Unbounded_String (Str_Field (S.G, "Name"));
      end if;
      --  gameName/language: settings Name/Language offered as a previewed
      --  fill when the game stem resolves; canonical empty otherwise.
      Set_Field (O, "gameName", N_Str (V, "gameName", "/gameName", To_String (G_Name), C));
      Set_Field (O, "language", N_Str (V, "language", "/language",
                                       (if S.G.Kind = JSON_Object_Type
                                        then Str_Field (S.G, "Language", "English") else ""),
                                       C));
      Set_Field (O, "revision", N_Int (V, "revision", "/revision", 1, C, Min => 1));
      Set_Field (O, "formatVersion", N_Format_Version (V, C));
      Set_Field (O, "createdAt", N_Timestamp (V, "createdAt", "/createdAt", C));
      Set_Field (O, "updatedAt", N_Timestamp (V, "updatedAt", "/updatedAt", C));
      Set_Field (O, "isRetired", N_Bool (V, "isRetired", "/isRetired", C));
      Set_Field (O, "isDeadish", N_Bool (V, "isDeadish", "/isDeadish", C));
      Set_Field (O, "traumaPending", N_Bool (V, "traumaPending", "/traumaPending", C));
      Set_Field (O, "isOutOfAction", N_Bool (V, "isOutOfAction", "/isOutOfAction", C));
      Set_Field (O, "stressClearPending", N_Bool (V, "stressClearPending", "/stressClearPending", C));
      Set_Field (O, "dossier", N_Dossier (V, C));
      Set_Field (O, "monitor", N_Monitor (V, S, C));
      Set_Field (O, "talent", N_Talent (V, S, C));
      Set_Field (O, "playbook", N_Playbook (V, S, C));
      Set_Field (O, "gear", N_Gear (V, S, C));
      Set_Field (O, "fund", N_Fund (V, S, C));
      Set_Field (O, "rolodex", N_Rolodex (V, C));
      Set_Field (O, "session", N_Session (V, S, C));
      Set_Field (O, "notebook", N_Str (V, "notebook", "/notebook", "", C));
      return O;
   end Canonicalize_Character;

   function Canonicalize_Crew
     (V : JSON_Value; Kind, Id : String; C : in out N_Ctx) return JSON_Value
   is
      O : JSON_Value := Create_Object;
      Stem : Unbounded_String := Null_Unbounded_String;
      S : Settings_Ref;
      G_Name : Unbounded_String := Null_Unbounded_String;
   begin
      List_Removals (V, "", Allowed_Crew, C);
      --  identity (Q15)
      if Has_Field (V, "kind") and then Get (V, "kind").Kind = JSON_String_Type
        and then Str_Field (V, "kind") = Kind
      then
         Set_Field (O, "kind", Kind);
      else
         Add_Change (C, "/kind", "identity normalization",
                     (if Has_Field (V, "kind") then Get (V, "kind") else JSON_Null),
                     Create (Kind),
                     "Body kind does not match route " & Kind
                     & ": normalized to route identity (directory is authoritative)");
         Set_Field (O, "kind", Kind);
      end if;
      if Has_Field (V, "id") and then Get (V, "id").Kind = JSON_String_Type
        and then Str_Field (V, "id") = Id
      then
         Set_Field (O, "id", Id);
      else
         Add_Change (C, "/id", "identity normalization",
                     (if Has_Field (V, "id") then Get (V, "id") else JSON_Null),
                     Create (Id),
                     "Body id does not match route " & Id
                     & ": normalized to route identity (directory is authoritative)");
         Set_Field (O, "id", Id);
      end if;
      --  gameStem resolution
      if Has_Field (V, "gameStem") and then Get (V, "gameStem").Kind = JSON_String_Type
        and then Valid_Stem (Str_Field (V, "gameStem"))
      then
         Stem := To_Unbounded_String (Str_Field (V, "gameStem"));
         Set_Field (O, "gameStem", Create (To_String (Stem)));
      elsif not Has_Field (V, "gameStem") or else Get (V, "gameStem").Kind = JSON_Null_Type then
         declare CS : constant String := Campaign_Stem; begin
            if CS /= "" then
               Stem := To_Unbounded_String (CS);
               Add_Change (C, "/gameStem", "derived fill", JSON_Null, Create (CS),
                           "Missing required property /gameStem: filled with campaign-derived default "
                           & CS);
               Set_Field (O, "gameStem", Create (CS));
            else
               Add_Needs (C, "/gameStem", "missing required property (no campaign context)",
                          "a caller-supplied value");
               Set_Field (O, "gameStem", JSON_Null);
            end if;
         end;
      else
         Add_Needs (C, "/gameStem", "wrong gameStem value",
                    "a value matching ^[A-Za-z0-9-]+$");
         Set_Field (O, "gameStem", Clone (Get (V, "gameStem")));
      end if;
      S := (To_Unbounded_String (To_String (Stem)), Game (To_String (Stem)));
      if S.G.Kind = JSON_Object_Type then
         G_Name := To_Unbounded_String (Str_Field (S.G, "Name"));
      end if;
      Set_Field (O, "gameName", N_Str (V, "gameName", "/gameName", To_String (G_Name), C));
      Set_Field (O, "language", N_Str (V, "language", "/language",
                                       (if S.G.Kind = JSON_Object_Type
                                        then Str_Field (S.G, "Language", "English") else ""),
                                       C));
      Set_Field (O, "revision", N_Int (V, "revision", "/revision", 1, C, Min => 1));
      Set_Field (O, "formatVersion", N_Format_Version (V, C));
      Set_Field (O, "createdAt", N_Timestamp (V, "createdAt", "/createdAt", C));
      Set_Field (O, "updatedAt", N_Timestamp (V, "updatedAt", "/updatedAt", C));
      Set_Field (O, "crewTypeName", N_Str (V, "crewTypeName", "/crewTypeName", "", C));
      Set_Field (O, "name", N_Str (V, "name", "/name", "", C));
      Set_Field (O, "lair", N_Str (V, "lair", "/lair", "", C));
      Set_Field (O, "reputation", N_Str (V, "reputation", "/reputation", "", C));
      Set_Field (O, "huntingGrounds", N_Str (V, "huntingGrounds", "/huntingGrounds", "", C));
      Set_Field (O, "tier", N_Int (V, "tier", "/tier", 0, C, Min => 0));
      Set_Field (O, "hold", N_Enum (V, "hold", "/hold", C, "|strong|weak|",
                                    Hold_Legacy, Default => "strong"));
      Set_Field (O, "heat", N_Bounded (V, "heat", "/heat", S,
                                       "CrewTrackerMaxima.HeatMax", 9, C));
      Set_Field (O, "wanted", N_Bounded (V, "wanted", "/wanted", S,
                                         "CrewTrackerMaxima.WantedMax", 4, C));
      Set_Field (O, "rep", N_Bounded (V, "rep", "/rep", S,
                                      "CrewTrackerMaxima.RepMax", 12, C));
      Set_Field (O, "experience", N_Experience (V, "experience", "/experience", S,
                                                "XpTrackMaxima.Crew", 10, C));
      Set_Field (O, "specialAbilities",
                 N_Items (V, "specialAbilities", "", "/specialAbilities", S, C,
                          Spec_Ability_Item'Access));
      Set_Field (O, "upgrades", N_Items (V, "upgrades", "", "/upgrades", S, C,
                                         Upgrade_Item'Access));
      Set_Field (O, "cohorts", N_Items (V, "cohorts", "", "/cohorts", S, C,
                                        Cohort_Item'Access));
      Set_Field (O, "coin", N_Int (V, "coin", "/coin", 0, C, Min => 0));
      Set_Field (O, "stash", N_Int (V, "stash", "/stash", 0, C, Min => 0));
      Set_Field (O, "notes", N_Notes (V, "notes", "/notes", C));
      --  turf: L7 (pre-C4 crews lack it) + D5 clamp to [0, TurfMax]
      declare
         TMax : constant Integer :=
           (if S.G.Kind = JSON_Object_Type then Settings_Int (S, "TurfMax", 6) else 6);
         TV : JSON_Value;
      begin
         if not Has_Field (V, "turf") or else Get (V, "turf").Kind = JSON_Null_Type then
            Add_Change (C, "/turf", "legacy conversion (L7)", JSON_Null, Create (Integer'(0)),
                        "Legacy shape at /turf: converted per rule L7: missing turf filled with 0");
            TV := Create (Integer'(0));
         else
            TV := N_Int (V, "turf", "/turf", 0, C, Min => 0, Max => TMax);
         end if;
         Set_Field (O, "turf", TV);
      end;
      --  contacts/factions: L6 (C3-era crews lack them) — empty means none
      Set_Field (O, "contacts", N_Items (V, "contacts", "", "/contacts", S, C,
                                         Contact_Item'Access, L6 => True));
      Set_Field (O, "factions", N_Items (V, "factions", "", "/factions", S, C,
                                         Faction_Item'Access, L6 => True));
      Set_Field (O, "claimedClaimIds", N_Claimed_Ids (V, "/claimedClaimIds", C));
      Set_Field (O, "claimOverrides",
                 N_Items (V, "claimOverrides", "", "/claimOverrides", S, C,
                          Override_Item'Access));
      return O;
   end Canonicalize_Crew;

   --  clock size: no usable positive default (a guess would change game
   --  meaning) — the governing spec's needs-input example.
   function N_Size (O : JSON_Value; C : in out N_Ctx) return JSON_Value is
   begin
      if Has_Field (O, "size") and then Get (O, "size").Kind = JSON_Int_Type
        and then Int_Field (O, "size") >= 1
      then
         return Clone (Get (O, "size"));
      end if;
      if Has_Field (O, "size") and then Get (O, "size").Kind /= JSON_Null_Type then
         Add_Needs (C, "/size", "wrong size value (minimum 1; no derivable default)",
                    "an integer of at least 1");
         return Clone (Get (O, "size"));
      end if;
      Add_Needs (C, "/size", "missing required property (no derivable default)",
                 "a caller-supplied integer of at least 1");
      return JSON_Null;
   end N_Size;

   function N_Related_Ids (O : JSON_Value; C : in out N_Ctx) return JSON_Value is
   begin
      if not Has_Field (O, "relatedClockIds") or else Get (O, "relatedClockIds").Kind = JSON_Null_Type then
         Add_Change (C, "/relatedClockIds", "missing/null fill", JSON_Null, Create (Empty_Array),
                     "Missing required property /relatedClockIds: filled with canonical default []");
         return Create (Empty_Array);
      end if;
      declare V : constant JSON_Value := Get (O, "relatedClockIds"); begin
         if V.Kind /= JSON_Array_Type then
            Add_Needs (C, "/relatedClockIds", "wrong type: expected an array", "an array of UUIDs");
            return Clone (V);
         end if;
      end;
      declare
         A : constant JSON_Array := Get (O, "relatedClockIds");
         V : constant JSON_Value := Get (O, "relatedClockIds");
         O2 : JSON_Array := Empty_Array;
         Dropped : Boolean := False;
      begin
         for I in 1 .. Length (A) loop
            declare
               Item : constant JSON_Value := Get (A, I);
               P : constant String := "/relatedClockIds/" & Trim_Image (I - 1);
            begin
               if Item.Kind /= JSON_String_Type then
                  Add_Needs (C, P, "wrong type: expected a string", "a UUID");
                  Append (O2, Clone (Item));
               else
                  declare S : constant String := String'(Get (Item)); begin
                  if not Is_Uuid (S) then
                     Add_Needs (C, P, "wrong value: not a UUID", "a UUID");
                     Append (O2, Create (S));
                  else
                     declare Dup : Boolean := False; begin
                        for J in 1 .. Length (O2) loop
                           if String'(Get (Get (O2, J))) = S then Dup := True; exit; end if;
                        end loop;
                        if Dup then Dropped := True;
                        else Append (O2, Create (S));
                        end if;
                     end;
                  end if;
                  end;
               end if;
            end;
         end loop;
         if Dropped then
            Add_Change (C, "/relatedClockIds", "uniqueItems", Clone (V), Create (O2),
                        "Property /relatedClockIds contains duplicate items: de-duplicated");
         end if;
         return Create (O2);
      end;
   end N_Related_Ids;

   function Canonicalize_Clock
     (V : JSON_Value; Kind, Id : String; C : in out N_Ctx) return JSON_Value
   is
      O : JSON_Value := Create_Object;
      Used_Clock_Kind : Boolean := False;
      Used_Time : Boolean := False;
      Behavior_Val : Unbounded_String := Null_Unbounded_String;
      Size_N : Integer := 0;
      Size_Ok : Boolean := False;
      Exempt : Unbounded_String := Null_Unbounded_String;
   begin
      --  L5: behavior resolution happens first so the legacy-key exemption
      --  for the generic unknown-key listing can be computed.
      if not Has_Field (V, "behavior") or else Get (V, "behavior").Kind = JSON_Null_Type then
         if Has_Field (V, "clockKind") and then Get (V, "clockKind").Kind = JSON_String_Type then
            Used_Clock_Kind := True;
            if Str_Field (V, "clockKind") = "rollover" then
               Behavior_Val := To_Unbounded_String ("rollover");
            elsif Str_Field (V, "clockKind") = "project" then
               Behavior_Val := To_Unbounded_String ("bounded");
            end if;
            if Behavior_Val = "" then
               Add_Needs (C, "/behavior", "wrong clockKind value; no derivable behavior",
                          "behavior bounded or rollover");
            else
               Add_Change (C, "/clockKind", "legacy conversion (L5)",
                           Create (Str_Field (V, "clockKind")), Create (Behavior_Val),
                           "Legacy shape at /clockKind: converted per rule L5: clockKind -> behavior");
            end if;
         elsif Has_Field (V, "rollover") then
            --  presence of a rollover key (even 0) means RolloverClock (L5)
            Behavior_Val := To_Unbounded_String ("rollover");
            Add_Change (C, "/behavior", "legacy conversion (L5)", JSON_Null, Create ("rollover"),
                        "Legacy shape at /behavior: converted per rule L5: rollover presence -> behavior rollover");
         else
            Add_Needs (C, "/behavior", "missing required property (ambiguous; no derivable value)",
                       "behavior bounded or rollover");
         end if;
      elsif Get (V, "behavior").Kind = JSON_String_Type then
         if Str_Field (V, "behavior") = "bounded" or else Str_Field (V, "behavior") = "rollover" then
            Behavior_Val := To_Unbounded_String (Str_Field (V, "behavior"));
         else
            Add_Change (C, "/behavior",
                        "needs-input: enum variant " & Str_Field (V, "behavior")
                        & " not in |bounded|rollover|: requires caller-supplied value",
                        Create (Str_Field (V, "behavior")), JSON_Null,
                        "Property /behavior value '" & Str_Field (V, "behavior")
                        & "' is not in |bounded|rollover|: not a known variant; requires a caller-supplied value");
            Add_Needs (C, "/behavior",
                       "wrong enum value: " & Str_Field (V, "behavior")
                       & " is not in |bounded|rollover|: not a known variant; requires a caller-supplied value",
                       "behavior bounded or rollover");
         end if;
      else
         Add_Needs (C, "/behavior", "wrong type: expected a string", "behavior bounded or rollover");
      end if;
      if Has_Field (V, "time") and then Get (V, "time").Kind /= JSON_Null_Type then
         if not Has_Field (V, "segments") or else Get (V, "segments").Kind = JSON_Null_Type then
            Used_Time := True;
         end if;
      end if;
      Exempt := To_Unbounded_String
        ((if Used_Clock_Kind then "|clockKind|" else "")
         & (if Used_Time then "|time|" else ""));
      List_Removals (V, "", Allowed_Clock, C, To_String (Exempt));
      --  identity (Q15)
      if Has_Field (V, "kind") and then Get (V, "kind").Kind = JSON_String_Type
        and then Str_Field (V, "kind") = Kind
      then
         Set_Field (O, "kind", Kind);
      else
         Add_Change (C, "/kind", "identity normalization",
                     (if Has_Field (V, "kind") then Get (V, "kind") else JSON_Null),
                     Create (Kind),
                     "Body kind does not match route " & Kind
                     & ": normalized to route identity (directory is authoritative)");
         Set_Field (O, "kind", Kind);
      end if;
      if Has_Field (V, "id") and then Get (V, "id").Kind = JSON_String_Type
        and then Str_Field (V, "id") = Id
      then
         Set_Field (O, "id", Id);
      else
         Add_Change (C, "/id", "identity normalization",
                     (if Has_Field (V, "id") then Get (V, "id") else JSON_Null),
                     Create (Id),
                     "Body id does not match route " & Id
                     & ": normalized to route identity (directory is authoritative)");
         Set_Field (O, "id", Id);
      end if;
      Set_Field (O, "revision", N_Int (V, "revision", "/revision", 1, C, Min => 1));
      Set_Field (O, "formatVersion", N_Format_Version (V, C));
      Set_Field (O, "createdAt", N_Timestamp (V, "createdAt", "/createdAt", C));
      Set_Field (O, "updatedAt", N_Timestamp (V, "updatedAt", "/updatedAt", C));
      --  name: identifying configuration; no canonical empty (minLength 1)
      if Has_Field (V, "name") and then Get (V, "name").Kind = JSON_String_Type
        and then Str_Field (V, "name") /= ""
      then
         Set_Field (O, "name", Create (Str_Field (V, "name")));
      else
         Add_Needs (C, "/name", "missing or empty name (no canonical empty)",
                    "a non-empty string");
         Set_Field (O, "name",
                    (if Has_Field (V, "name") then Clone (Get (V, "name")) else JSON_Null));
      end if;
      Set_Field (O, "ownerKind", N_Enum (V, "ownerKind", "/ownerKind", C,
                                         "|campaign|character|crew|", No_Legacy,
                                         Default => "campaign"));
      Set_Field (O, "ownerId", N_Str (V, "ownerId", "/ownerId", "", C));
      Set_Field (O, "purpose", N_Enum (V, "purpose", "/purpose", C,
                                       "|progress|danger|racing|linked|mission|tug-of-war|long-term-project|faction|score|custom|",
                                       No_Legacy, Default => "custom"));
      if To_String (Behavior_Val) /= "" then
         Set_Field (O, "behavior", Create (To_String (Behavior_Val)));
      elsif Has_Field (V, "behavior") then
         Set_Field (O, "behavior", Clone (Get (V, "behavior")));
      else
         Set_Field (O, "behavior", JSON_Null);
      end if;
      --  size first (needed for the segments clamp)
      declare SV : constant JSON_Value := N_Size (V, C); begin
         if SV.Kind = JSON_Int_Type then
            declare N : constant Integer := Integer'(Get (SV)); begin
               if N >= 1 then Size_N := N; Size_Ok := True; end if;
            end;
         end if;
         Set_Field (O, "size", SV);
      end;
      --  segments: FILL 0; legacy "time" maps to segments (L5); then the
      --  x-segmentsLeSize clamp
      declare
         SV : JSON_Value;
      begin
         if Used_Time then
            declare N : Integer; begin
               if Get (V, "time").Kind = JSON_Int_Type then
                  N := Integer'(Get (Get (V, "time")));
                  Add_Change (C, "/time", "legacy conversion (L5)",
                              Clone (Get (V, "time")), Create (N),
                              "Legacy shape at /time: converted per rule L5: time -> segments");
                  SV := Create (N);
               elsif Get (V, "time").Kind = JSON_String_Type
                 and then Int_From_String (Str_Field (V, "time"), N)
               then
                  Add_Change (C, "/time", "legacy conversion (L5)",
                              Clone (Get (V, "time")), Create (N),
                              "Legacy shape at /time: converted per rule L5: time -> segments");
                  SV := Create (N);
               else
                  Add_Needs (C, "/segments", "wrong time value; cannot derive segments",
                             "an integer");
                  SV := (if Has_Field (V, "segments") then Clone (Get (V, "segments")) else JSON_Null);
               end if;
            end;
         else
            SV := N_Int (V, "segments", "/segments", 0, C, Min => 0);
         end if;
         if Size_Ok and then SV.Kind = JSON_Int_Type and then Integer'(Get (SV)) > Size_N then
            Add_Change (C, "/segments", "clamp", Clone (SV), Create (Size_N),
                        "Property /segments value " & Trim_Image (Integer'(Get (SV)))
                        & " exceeds size " & Trim_Image (Size_N)
                        & " (x-segmentsLeSize): clamped to " & Trim_Image (Size_N));
            SV := Create (Size_N);
         end if;
         Set_Field (O, "segments", SV);
      end;
      --  rollover: FILL 0; bounded clocks must carry 0 (schema if/then)
      declare
         RV : JSON_Value := N_Int (V, "rollover", "/rollover", 0, C, Min => 0);
      begin
         if To_String (Behavior_Val) = "bounded" and then RV.Kind = JSON_Int_Type
           and then Integer'(Get (RV)) /= 0
         then
            Add_Change (C, "/rollover", "const", Clone (RV), Create (Integer'(0)),
                        "Property /rollover must be 0 when behavior is bounded (schema if/then): set to 0");
            RV := Create (Integer'(0));
         end if;
         Set_Field (O, "rollover", RV);
      end;
      Set_Field (O, "relatedClockIds", N_Related_Ids (V, C));
      return O;
   end Canonicalize_Clock;

   function Canonicalize (Kind, Id : String; V : JSON_Value) return JSON_Value is
      C : N_Ctx;
      R : JSON_Value := Create_Object;
      Doc : JSON_Value := JSON_Null;
      Outcome : Unbounded_String := Null_Unbounded_String;
   begin
      if V.Kind /= JSON_Object_Type then
         --  D9: a non-object root is unreadable — no normalization possible
         declare Issues : JSON_Array := Empty_Array; begin
            Append (Issues, Issue_At
                      ("", "document root is not an entity object; unreadable — cannot be normalized",
                       "a parseable entity object"));
            Set_Field (R, "outcome", "unreadable");
            Set_Field (R, "canonical", False);
            Set_Field (R, "changes", Empty_Array);
            Set_Field (R, "warnings", Empty_Array);
            Set_Field (R, "needsInputPointers", Empty_Array);
            Set_Field (R, "issues", Issues);
         end;
         return R;
      end if;
      if Has_Field (V, "kind") and then Get (V, "kind").Kind = JSON_String_Type
        and then Str_Field (V, "kind") /= Kind
      then
         --  D8: a body of a wholly different entity type needs the caller's
         --  decision (repair or delete + re-import); never normalized.
         declare
            Issues : JSON_Array := Empty_Array;
            Needs  : JSON_Array := Empty_Array;
         begin
            Append (Issues, Issue_At
                      ("/kind", "identity: body kind " & Str_Field (V, "kind")
                       & " does not match route " & Kind
                       & " (directory is authoritative)",
                       "kind " & Kind));
            Append (Needs, Create ("/kind"));
            Set_Field (R, "outcome", "needs-input");
            Set_Field (R, "canonical", False);
            Set_Field (R, "document", Clone (V));
            Set_Field (R, "changes", Empty_Array);
            Set_Field (R, "warnings", Empty_Array);
            Set_Field (R, "needsInputPointers", Needs);
            Set_Field (R, "issues", Issues);
         end;
         return R;
      end if;
      if Kind = "character" then Doc := Canonicalize_Character (V, Kind, Id, C);
      elsif Kind = "crew" then Doc := Canonicalize_Crew (V, Kind, Id, C);
      else Doc := Canonicalize_Clock (V, Kind, Id, C);
      end if;
      if Length (C.Needs) > 0 then Outcome := To_Unbounded_String ("needs-input");
      elsif Length (C.Changes) > 0 then Outcome := To_Unbounded_String ("repairable");
      else Outcome := To_Unbounded_String ("canonical");
      end if;
      Set_Field (R, "outcome", To_String (Outcome));
      Set_Field (R, "canonical", To_String (Outcome) = "canonical");
      Set_Field (R, "document", Doc);
      Set_Field (R, "changes", C.Changes);
      Set_Field (R, "warnings", C.Warnings);
      Set_Field (R, "needsInputPointers", C.Needs);
      Set_Field (R, "issues", C.Issues);
      return R;
   end Canonicalize;

   function Canonicalize (Kind, Id : String; Bytes : String) return JSON_Value is
   begin
      return Canonicalize (Kind, Id, Read (Bytes));
   exception
      when others =>
         --  D10: unparseable bytes (invalid UTF-8, truncation, trailing
         --  garbage) are unreadable — deletion only.
         declare
            R : JSON_Value := Create_Object;
            Issues : JSON_Array := Empty_Array;
         begin
            Append (Issues, Issue_At
                      ("", "bytes cannot be parsed as JSON; unreadable — cannot be normalized",
                       "a parseable entity object"));
            Set_Field (R, "outcome", "unreadable");
            Set_Field (R, "canonical", False);
            Set_Field (R, "changes", Empty_Array);
            Set_Field (R, "warnings", Empty_Array);
            Set_Field (R, "needsInputPointers", Empty_Array);
            Set_Field (R, "issues", Issues);
            return R;
         end;
   end Canonicalize;

   ---------------------------------------------------------------------------
   --  SC-A2 import/repair transaction helpers.
   ---------------------------------------------------------------------------

   --  sha256:<lowercase hex> content token of raw bytes (frozen
   --  errorContentToken pattern); also the delete/repair If-Match value for
   --  degraded entities.
   function Content_Token (Bytes : String) return String is
     ("sha256:" & GNAT.SHA256.Digest (Bytes));

   --  RFC 6901 pointer walking: split "/a/b/0" into segments (array indices
   --  are 0-based per the pointer spec).
   Max_Pointer_Segments : constant := 32;
   type Seg_List is array (1 .. Max_Pointer_Segments) of Unbounded_String;

   procedure Split_Pointer (Pointer : String; Segs : out Seg_List; N : out Natural) is
      P : Natural := Pointer'First;
   begin
      N := 0;
      while P <= Pointer'Last loop
         declare
            E : Natural := P;
         begin
            while E <= Pointer'Last and then Pointer (E) /= '/' loop
               E := E + 1;
            end loop;
            if E > P and then N < Max_Pointer_Segments then
               N := N + 1;
               Segs (N) := To_Unbounded_String (Pointer (P .. E - 1));
            end if;
            P := E + 1;
         end;
      end loop;
   end Split_Pointer;

   function Get_At_Pointer (Doc : JSON_Value; Pointer : String) return JSON_Value is
      Segs : Seg_List;
      N    : Natural;
      Cur  : JSON_Value := Doc;
   begin
      Split_Pointer (Pointer, Segs, N);
      for I in 1 .. N loop
         declare
            S   : constant String := To_String (Segs (I));
            Idx : Integer;
         begin
            if Cur.Kind = JSON_Object_Type and then Has_Field (Cur, S) then
               Cur := Get (Cur, S);
            elsif Cur.Kind = JSON_Array_Type and then Int_From_String (S, Idx) then
               if Idx >= 0 and then Idx < Length (JSON_Array'(Get (Cur))) then
                  Cur := Get (JSON_Array'(Get (Cur)), Idx + 1);
               else
                  return JSON_Null;
               end if;
            else
               return JSON_Null;
            end if;
         end;
      end loop;
      return Cur;
   end Get_At_Pointer;

   function Int_At_Pointer (Doc : JSON_Value; Pointer : String) return Integer is
      V : constant JSON_Value := Get_At_Pointer (Doc, Pointer);
   begin
      if V.Kind = JSON_Int_Type then return Integer'(Get (V)); end if;
      return Integer'First; --  absent or non-integer: not checked
   end Int_At_Pointer;

   --  Set Value at Pointer inside Doc (object keys; array indices resolve
   --  only as intermediate steps).  Returns False when the path cannot be
   --  resolved or the final segment is an array index.
   function Set_At_Pointer
     (Doc : JSON_Value; Pointer : String; Value : JSON_Value) return Boolean
   is
      Segs : Seg_List;
      N    : Natural;
      Cur  : JSON_Value := Doc;
   begin
      Split_Pointer (Pointer, Segs, N);
      if N = 0 then return False; end if;
      for I in 1 .. N - 1 loop
         declare
            S   : constant String := To_String (Segs (I));
            Idx : Integer;
         begin
            if Cur.Kind = JSON_Object_Type and then Has_Field (Cur, S) then
               Cur := Get (Cur, S);
            elsif Cur.Kind = JSON_Array_Type and then Int_From_String (S, Idx) then
               if Idx >= 0 and then Idx < Length (JSON_Array'(Get (Cur))) then
                  Cur := Get (JSON_Array'(Get (Cur)), Idx + 1);
               else
                  return False;
               end if;
            else
               return False;
            end if;
         end;
      end loop;
      if Cur.Kind = JSON_Object_Type then
         Set_Field (Cur, To_String (Segs (N)), Value);
         return True;
      end if;
      return False;
   end Set_At_Pointer;

   --  Import preview: server-derivable needs-input pointers are resolved
   --  into previewed fills (R0 matrix §3: gameStem from the stored entity or
   --  the owning campaign — resolved FIRST so every settings-derived fill
   --  (DERIVED rows) computes; createdAt from the stored entity, else server
   --  'now'; updatedAt server 'now').  Each resolution becomes a change
   --  entry and warning; pointers that remain are caller-only needs-input.
   --  Mutates the canonicalize result R in place (re-running the canonicalizer
   --  when the gameStem becomes resolvable).
   procedure Resolve_Import_Needs
     (Kind, Id : String; Stored, Entity_V : JSON_Value; R : in out JSON_Value)
   is
      Doc      : JSON_Value;
      Needs    : JSON_Array;
      All_Issues : JSON_Array;
      Changes  : JSON_Array := Empty_Array;
      Warnings : JSON_Array := Empty_Array;
      Remaining : JSON_Array := Empty_Array;
      Issues   : JSON_Array := Empty_Array;
      Stem     : Unbounded_String := Null_Unbounded_String;
      Created  : Unbounded_String := Null_Unbounded_String;
   begin
      if Stored.Kind = JSON_Object_Type then
         Stem := To_Unbounded_String (Str_Field (Stored, "gameStem"));
         Created := To_Unbounded_String (Str_Field (Stored, "createdAt"));
      end if;
      if Length (Stem) = 0 then Stem := To_Unbounded_String (Campaign_Stem); end if;
      if Length (Created) = 0 then Created := To_Unbounded_String (Now); end if;
      if Length (Stem) > 0 and then
        (not Has_Field (Entity_V, "gameStem")
         or else Get (Entity_V, "gameStem").Kind = JSON_Null_Type)
      then
         Set_Field (Entity_V, "gameStem", To_String (Stem));
         declare
            X : JSON_Value := Create_Object;
         begin
            Set_Field (X, "pointer", "/gameStem");
            Set_Field (X, "reason", "derived fill (import context)");
            Set_Field (X, "previous", JSON_Null);
            Set_Field (X, "replacement", Create (To_String (Stem)));
            Append (Changes, X);
         end;
         Append (Warnings, Create
                   ("Missing required property /gameStem: filled with the campaign-derived default "
                    & To_String (Stem)));
         R := Canonicalize (Kind, Id, Entity_V);
      end if;
      Doc := Get (R, "document");
      Needs := Get (R, "needsInputPointers");
      All_Issues := Get (R, "issues");
      declare
         Run_Changes : constant JSON_Array := Get (Get (R, "changes"));
         Run_Warnings : constant JSON_Array := Get (Get (R, "warnings"));
      begin
         for I in 1 .. Length (Run_Changes) loop
            Append (Changes, Get (Run_Changes, I));
         end loop;
         for I in 1 .. Length (Run_Warnings) loop
            Append (Warnings, Get (Run_Warnings, I));
         end loop;
      end;
      for I in 1 .. Length (Needs) loop
         declare
            Ptr      : constant String := Get (Get (Needs, I));
            V        : JSON_Value := JSON_Null;
            Resolved : Boolean := False;
         begin
            if Ptr = "/createdAt" and then Length (Created) > 0 then
               V := Create (To_String (Created));
               Resolved := True;
            elsif Ptr = "/updatedAt" then
               V := Create (Now);
               Resolved := True;
            end if;
            if Resolved then
               Set_Field (Doc, Ptr (Ptr'First + 1 .. Ptr'Last), V);
               declare
                  X : JSON_Value := Create_Object;
               begin
                  Set_Field (X, "pointer", Ptr);
                  Set_Field (X, "reason", "server-stamped fill (import)");
                  Set_Field (X, "previous", JSON_Null);
                  Set_Field (X, "replacement", Clone (V));
                  Append (Changes, X);
               end;
               Append (Warnings, Create
                         ("Missing required property " & Ptr
                          & ": filled with a server-stamped value on apply"));
            else
               Append (Remaining, Create (Ptr));
            end if;
         end;
      end loop;
      for I in 1 .. Length (All_Issues) loop
         declare
            X : constant JSON_Value := Get (All_Issues, I);
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
            if Keep then Append (Issues, X); end if;
         end;
      end loop;
      Set_Field (R, "needsInputPointers", Remaining);
      Set_Field (R, "issues", Issues);
      Set_Field (R, "changes", Changes);
      Set_Field (R, "warnings", Warnings);
      Set_Field (R, "outcome",
                 (if Length (Remaining) > 0 then "needs-input"
                  elsif Length (Changes) > 0 then "repairable"
                  else "canonical"));
      Set_Field (R, "canonical",
                 Length (Remaining) = 0 and then Length (Changes) = 0);
   end Resolve_Import_Needs;

   --  Import apply gate (R4 gap #4, LIMIT-IMPORT-014): the submitted
   --  document is schema-valid, but settings-derived maxima (R0 matrix
   --  DERIVED rows) must never be exceeded by an import.  Every derived
   --  pointer present in the document is compared against the game-settings
   --  bound; a value above the bound becomes an INVALID_ENTRY issue and the
   --  apply is refused with nothing written.  Unresolvable settings (no
   --  gameStem / missing game file) skip the gate.
   function Settings_Maxima_Issues (Kind : String; Doc : JSON_Value) return JSON_Array is
      Out_A : JSON_Array := Empty_Array;
      Stem  : constant String := Str_Field (Doc, "gameStem");
      G     : constant JSON_Value := Game (Stem);
      S     : constant Settings_Ref := (To_Unbounded_String (Stem), G);

      procedure Check (Ptr, Key : String) is
         Bound : constant Integer := Settings_Int (S, Key, Integer'Last);
         Val   : constant Integer := Int_At_Pointer (Doc, Ptr);
      begin
         if Val /= Integer'First and then Bound /= Integer'Last
           and then Val > Bound
         then
            declare
               X : JSON_Value := Create_Object;
            begin
               Set_Field (X, "pointer", Ptr);
               Set_Field (X, "reason",
                          "value " & Trim_Image (Val)
                          & " exceeds the settings-derived maximum " & Trim_Image (Bound));
               Set_Field (X, "expected",
                          "an integer in [0, " & Trim_Image (Bound) & "]");
               Append (Out_A, X);
            end;
         end if;
      end Check;
   begin
      if G.Kind /= JSON_Object_Type then return Out_A; end if;
      if Kind = "character" then
         Check ("/monitor/stress/max", "StressMax");
         Check ("/monitor/trauma/max", "TraumaMax");
         Check ("/monitor/harm/healingClock/size", "RecoveryClockSize");
         Check ("/fund/satchel/max", "FundMaxima.SatchelMax");
         Check ("/fund/stash/max", "FundMaxima.StashMax");
         Check ("/playbook/experience/max", "XpTrackMaxima.Playbook");
         Check ("/session/max", "SessionExpressionMax");
         Check ("/gear/maxBulk", "LoadMaxima.MaxBulk");
         --  array items: attributes[].experience.max and actions[].maxRating
         declare
            Attrs : constant JSON_Value := Get_At_Pointer (Doc, "/talent/attributes");
         begin
            if Attrs.Kind = JSON_Array_Type then
               declare
                  Attr_Arr : constant JSON_Array := Get (Attrs);
               begin
                  for I in 1 .. Length (Attr_Arr) loop
                     declare
                        Item : constant JSON_Value := Get (Attr_Arr, I);
                     begin
                        if Item.Kind = JSON_Object_Type then
                           Check ("/talent/attributes/" & Trim_Image (I - 1)
                                  & "/experience/max", "XpTrackMaxima.Attribute");
                           if Has_Field (Item, "actions") then
                              declare
                                 Acts : constant JSON_Value := Get (Item, "actions");
                              begin
                                 if Acts.Kind = JSON_Array_Type then
                                    declare
                                       Act_Arr : constant JSON_Array := Get (Acts);
                                    begin
                                       for J in 1 .. Length (Act_Arr) loop
                                          Check ("/talent/attributes/" & Trim_Image (I - 1)
                                                 & "/actions/" & Trim_Image (J - 1)
                                                 & "/maxRating", "ActionPointMaximum");
                                       end loop;
                                    end;
                                 end if;
                              end;
                           end if;
                        end if;
                     end;
                  end loop;
               end;
            end if;
         end;
      else
         Check ("/experience/max", "XpTrackMaxima.Crew");
         Check ("/heat/max", "CrewTrackerMaxima.HeatMax");
         Check ("/wanted/max", "CrewTrackerMaxima.WantedMax");
         Check ("/rep/max", "CrewTrackerMaxima.RepMax");
         Check ("/turf", "TurfMax");
      end if;
      return Out_A;
   end Settings_Maxima_Issues;

   --  True when any change entry in Changes has the given reason prefix
   --  (used to detect classified unknown-key removals).
   function Has_Change_Reason (Changes : JSON_Array; Reason : String) return Boolean is
   begin
      for I in 1 .. Length (Changes) loop
         declare
            X : constant JSON_Value := Get (Changes, I);
         begin
            if Str_Field (X, "reason") = Reason then return True; end if;
         end;
      end loop;
      return False;
   end Has_Change_Reason;

   --  Issue triples for every change entry with the given reason (unknown-key
   --  removals), for the frozen INVALID_ENTRY details.
   function Issues_For_Reason (Changes : JSON_Array; Reason : String) return JSON_Array is
      Out_A : JSON_Array := Empty_Array;
   begin
      for I in 1 .. Length (Changes) loop
         declare
            X : constant JSON_Value := Get (Changes, I);
         begin
            if Str_Field (X, "reason") = Reason then
               Append (Out_A, Issue_At (Str_Field (X, "pointer"),
                                        "unknown property; removal was not classified by a preview",
                                        "remove the property or preview its classified removal"));
            end if;
         end;
      end loop;
      return Out_A;
   end Issues_For_Reason;

   --  True when B contains only the pipe-wrapped allowed field names.
   function Only_Fields (B : JSON_Value; Allowed : String) return Boolean is
      K : Key_Buffer;
      N : Natural;
   begin
      if B.Kind /= JSON_Object_Type then return False; end if;
      Collect_Keys (B, K, N);
      for I in 1 .. N loop
         if not In_Allowed (To_String (K (I)), Allowed) then return False; end if;
      end loop;
      return True;
   end Only_Fields;

   --  Crew Claims: is Claim_Id a canonical claim of this crew's type?
   --  Reads Game(stem & "-crews") CrewTypes[].Claims.Nodes[].Id.  The Lair
   --  is definition-owned and is NOT claimable via claim.set.
   function Claim_Exists (E : JSON_Value; Claim_Id : String; Is_Lair : out Boolean) return Boolean is
      G : constant JSON_Value := Game (Str_Field (E, "gameStem") & "-crews");
   begin
      Is_Lair := False;
      if G.Kind /= JSON_Object_Type or else not Has_Field (G, "CrewTypes") then
         return False;
      end if;
      declare Types : constant JSON_Array := Get (G, "CrewTypes"); begin
         for I in 1 .. Length (Types) loop
            declare T : constant JSON_Value := Get (Types, I); begin
               if Str_Field (T, "Name") = Str_Field (E, "crewTypeName")
                 and then Has_Field (T, "Claims")
               then
                  declare
                     C    : constant JSON_Value := Get (T, "Claims");
                     Ns   : constant JSON_Array := Get (C, "Nodes");
                  begin
                     for J in 1 .. Length (Ns) loop
                        declare N : constant JSON_Value := Get (Ns, J); begin
                           if Str_Field (N, "Id") = Claim_Id then
                              Is_Lair := Str_Field (N, "Kind", "claim") = "lair";
                              return True;
                           end if;
                        end;
                     end loop;
                  end;
               end if;
            end;
         end loop;
      end;
      return False;
   end Claim_Exists;

   --  Crew Claims (A15): derived effect evaluation.  Acquired claims carry
   --  typed effects ({Kind, Target, Delta}); only derivedDelta on crew.turf
   --  is currently modeled.  The effective value is BASE + SUM of deltas from
   --  controlled claims — recomputed from base state, never a subtractive
   --  compensation ledger, so clamps/manual edits cannot drift.
   function Turf_Effect_Delta (E : JSON_Value) return Integer is
      Sum : Integer := 0;
      G : constant JSON_Value := Game (Str_Field (E, "gameStem") & "-crews");
      Owned : constant JSON_Array :=
        (if Has_Field (E, "claimedClaimIds") then Get (E, "claimedClaimIds")
         else Empty_Array);
   begin
      if G.Kind /= JSON_Object_Type or else not Has_Field (G, "CrewTypes") then
         return 0;
      end if;
      declare Types : constant JSON_Array := Get (G, "CrewTypes"); begin
         for I in 1 .. Length (Types) loop
            declare T : constant JSON_Value := Get (Types, I); begin
               if Str_Field (T, "Name") = Str_Field (E, "crewTypeName")
                 and then Has_Field (T, "Claims")
               then
                  declare
                     C  : constant JSON_Value := Get (T, "Claims");
                     Ns : constant JSON_Array := Get (C, "Nodes");
                  begin
                     for J in 1 .. Length (Ns) loop
                        declare N : constant JSON_Value := Get (Ns, J); begin
                           if Has_Field (N, "Effects") then
                              declare
                                 Ef : constant JSON_Array := Get (N, "Effects");
                                 Owned_Now : Boolean := False;
                              begin
                                 for K in 1 .. Length (Owned) loop
                                    declare Owned_Id : constant UTF8_String := Get (Get (Owned, K)); begin
                                       if Owned_Id = Str_Field (N, "Id") then
                                          Owned_Now := True; exit;
                                       end if;
                                    end;
                                 end loop;
                                 if Owned_Now then
                                    for K in 1 .. Length (Ef) loop
                                       declare FX : constant JSON_Value := Get (Ef, K); begin
                                          if Str_Field (FX, "Kind") = "derivedDelta"
                                            and then Str_Field (FX, "Target") = "crew.turf"
                                          then
                                             Sum := Sum + Int_Field (FX, "Delta");
                                          end if;
                                       end;
                                    end loop;
                                 end if;
                              end;
                           end if;
                        end;
                     end loop;
                  end;
               end if;
            end;
         end loop;
      end;
      return Sum;
   end Turf_Effect_Delta;

   function Mutate (Kind, Op : String; E, B : JSON_Value) return JSON_Value is
      Requested : Integer := Integer'First; Effective : Integer := Integer'First;
      New_Value, Applied : Natural := 0;
      Target : JSON_Value;

      --  SC-A3: shared retirement cleanup (Q33 / LIFECYCLE-RETIRE-004),
      --  used by the explicit retire op and by resolving the max-th trauma:
      --  isRetired true; stress 0; pending/out-of-action flags false; all
      --  harm cleared; healing clock reset; armor usage false; isDeadish
      --  recomputed false.  Dossier, playbook, trauma history, notes, gear,
      --  and fund are preserved verbatim.
      procedure Retire_Character is
      begin
         Set_Field (E, "isRetired", True);
         Set_Field (Get (Get (E, "monitor"), "stress"), "current", Integer'(0));
         Set_Field (E, "traumaPending", False);
         Set_Field (E, "isOutOfAction", False);
         Set_Field (E, "stressClearPending", False);
         declare
            H : constant JSON_Value := Get (Get (E, "monitor"), "harm");
         begin
            Set_Field (H, "lesser", Empty_Array);
            Set_Field (H, "moderate", Empty_Array);
            Set_Field (H, "severe", Empty_Array);
            Set_Field (H, "fatal", Empty_Array);
            Set_Field (Get (H, "healingClock"), "segments", Integer'(0));
            Set_Field (Get (H, "healingClock"), "rollover", Integer'(0));
         end;
         declare
            A : constant JSON_Value := Get (Get (E, "monitor"), "armor");
         begin
            Set_Field (A, "standardUsed", False);
            Set_Field (A, "heavyUsed", False);
            Set_Field (A, "specialUsed", False);
         end;
         Set_Field (E, "isDeadish", False);
      end Retire_Character;
   begin
      if Kind = "character" and then Bool_Field (E, "isRetired")
        and then Op /= "trauma.add" and then Op /= "trauma.remove"
      then return Retired_Error (Op, "character is retired", E); end if;

      if Op = "stress.add" then
         Target := Get (Get (E,"monitor"),"stress"); Requested := Int_Field (B,"delta");
         --  LIFECYCLE gates: a pending trauma blocks until resolved;
         --  an out-of-action character is blocked until end-score releases.
         if Bool_Field (E, "traumaPending") then
            return Trauma_Required_Error
              (Op, "pending trauma must be resolved before adding stress", E);
         end if;
         if Bool_Field (E, "isOutOfAction") then
            return Out_Of_Action_Error
              (Op, "character is out of action until end-score", E);
         end if;
         declare
            Old : constant Integer := Int_Field (Target, "current");
         begin
            if Requested >= 0 then Core_Clamp_Add (Natural (Old), Natural (Int_Field (Target,"max")), Natural (Requested), New_Value, Applied);
            else Core_Clamp_Subtract (Natural (Old), Natural (Int_Field (Target,"max")), Natural (-Requested), New_Value, Applied); end if;
            Set_Field (Target,"current",Integer (New_Value));
            Effective := (if Requested >= 0 then Integer (Applied) else -Integer (Applied));
            --  LIFECYCLE-STRESS-001: landing at max from below raises the
            --  pending-trauma flag (NEVER auto-trauma, LIFECYCLE-STRESS-002).
            if Requested > 0 and then Old < Int_Field (Target, "max")
              and then New_Value = Natural (Int_Field (Target, "max"))
            then
               Set_Field (E, "traumaPending", True);
               return Success_Result (Op,E,Requested,Effective,
                                      Side => "stress full — trauma pending");
            end if;
            return Success_Result (Op,E,Requested,Effective,
              Side => (if Requested >= 0
                         and then New_Value = Natural (Int_Field (Target, "max"))
                       then "stress full — consider trauma" else ""));
         end;
      elsif Op = "stress.clear" then
         if Bool_Field (E, "traumaPending") then
            return Trauma_Required_Error
              (Op, "pending trauma must be resolved before clearing stress", E);
         end if;
         if Bool_Field (E, "isOutOfAction") then
            return Out_Of_Action_Error
              (Op, "character is out of action until end-score", E);
         end if;
         declare X : constant JSON_Value := Get (Get (E,"monitor"),"stress"); begin Set_Field (X,"current",Integer'(0)); end;
      elsif Op = "trauma.add" or else Op = "trauma.remove" then
         declare
            T     : constant JSON_Value := Get(Get(E,"monitor"),"trauma");
            A     : constant JSON_Array := Get(T,"traumas");
            O     : JSON_Array := Empty_Array;
            Name  : constant String := Str_Field(B,"trauma");
            Found : Boolean := False;
         begin
            for I in 1..Length(A) loop
               if String'(Get(Get(A,I)))=Name then Found:=True;end if;
            end loop;
            if Op = "trauma.add" then
               --  W14: resolution-only — never auto-adds trauma; requires
               --  the pending flag raised by landing at max stress.
               if not Bool_Field (E, "traumaPending") then
                  return Validation_Error
                    (Op, "trauma.add requires a pending trauma (stress at maximum)",
                     Root_Issues ("trauma.add requires a pending trauma (stress at maximum)"), E);
               end if;
               if Found then
                  return Duplicate_Error (Op, "trauma already in history", E);
               end if;
               O := A; Append (O, Create (Name));
               Set_Field (T,"traumas",O);
               --  LIFECYCLE-TRAUMA-001: resolution clears the pending flag
               --  and puts the character out of action (stress stays full).
               Set_Field (E, "traumaPending", False);
               Set_Field (E, "isOutOfAction", True);
               Set_Field (E, "stressClearPending", True);
               --  resolving the max-th trauma runs the shared retirement
               --  cleanup in the SAME transition (LIFECYCLE-TRAUMA-001/002)
               if Length (O) >= Natural (Int_Field (T, "max")) then
                  Retire_Character;
               end if;
            else
               --  trauma.remove: the trauma-history correction path, allowed
               --  on retired characters; never recomputes isRetired.
               for I in 1..Length(A) loop
                  if String'(Get(Get(A,I)))=Name then Found:=True;
                  else Append(O,Get(A,I));end if;
               end loop;
               if not Found then
                  return Not_Found_Error (Op, "trauma not found", E);
               end if;
               Set_Field(T,"traumas",O);
            end if;
         end;
      elsif Op = "harm.add" then
         declare H:constant JSON_Value:=Get(Get(E,"monitor"),"harm"); Start:constant String:=Str_Field(B,"intensity","lesser"); Desc:constant String:=Str_Field(B,"description"); Land:Unbounded_String; begin
            for Level of Level_Array'(To_Unbounded_String("lesser"),To_Unbounded_String("moderate"),To_Unbounded_String("severe"),To_Unbounded_String("fatal")) loop
               if (Start="lesser" or else To_String(Level)/="lesser") and then (Start/="severe" or else (To_String(Level)="severe" or else To_String(Level)="fatal")) and then (Start/="moderate" or else To_String(Level)/="lesser") and then (Start/="fatal" or else To_String(Level)="fatal") then
                  declare A:constant JSON_Array:=Get(H,To_String(Level));Cap:constant Natural:=(if To_String(Level)="lesser" or else To_String(Level)="moderate" then 2 else 1);begin if Length(A)<Cap and then Length(Land)=0 then declare O:JSON_Array:=A;begin Append(O,Create(Desc));Set_Field(H,To_String(Level),O);Land:=Level;end;end if;end;
               end if;
            end loop;
            if Length(Land)=0 then return Slot_Full_Fatal_Error(Op,"all harm slots are full",E);end if;Set_Field(E,"isDeadish",Array_Length(H,"fatal")>0);return Success_Result(Op,E,Landed=>To_String(Land),Side=>(if To_String(Land)/=Start then "harm spilled to "&To_String(Land) else ""));
         end;
      elsif Op = "harm.remove" then
         declare H:constant JSON_Value:=Get(Get(E,"monitor"),"harm");Level:constant String:=Str_Field(B,"intensity");Desc:constant String:=Str_Field(B,"description");A:constant JSON_Array:=Get(H,Level);O:JSON_Array:=Empty_Array;Skipped:Boolean:=False;begin for I in 1..Length(A) loop if not Skipped and then String'(Get(Get(A,I)))=Desc then Skipped:=True;else Append(O,Get(A,I));end if;end loop;Set_Field(H,Level,O);Set_Field(E,"isDeadish",Array_Length(H,"fatal")>0);end;
      elsif Op = "armor.set" then
         declare A:constant JSON_Value:=Get(Get(E,"monitor"),"armor");Name:constant String:=Str_Field(B,"armor");Used:constant Boolean:=Bool_Field(B,"used");Key:constant String:=(if Name="standard" then "standardUsed" elsif Name="heavy" then "heavyUsed" else "specialUsed");Has:constant String:=(if Name="standard" then "hasStandard" elsif Name="heavy" then "hasHeavy" else "hasSpecial");begin
            --  BUG-006: availability is derived from loadout/abilities.
            Set_Field (A, Has, Armor_Available (E, Name));
            if Used and then not Armor_Available (E, Name) then
               return Armor_Not_Available_Error(Op,"armor is not available",E);
            end if;
            Set_Field(A,Key,Used);
         end;
      elsif Op = "playbook-xp.add" then
         Target := Get (Get (E,"playbook"),"experience"); Requested := Int_Field (B,"delta");
         Core_Clamp_Add (Natural (Int_Field(Target,"points")),Natural(Int_Field(Target,"max")),Natural'Max(0,Requested),New_Value,Applied);
         Set_Field(Target,"points",Integer(New_Value)); Effective:=Integer(Applied); return Success_Result(Op,E,Requested,Effective);
      elsif Op = "playbook-xp.clear" then declare X : constant JSON_Value := Get(Get(E,"playbook"),"experience"); begin Set_Field(X,"points",Integer'(0)); end;
      elsif Op = "action.set-rating" then
         declare
            Attrs : constant JSON_Array := Get(Get(E,"talent"),"attributes");
            Name  : constant String := Str_Field(B,"action");
            Rating : constant Integer := Int_Field(B,"rating");
            Found : Boolean := False;
         begin
            if Rating < 0 then
               return Validation_Error (Op, "invalid action rating",
                                        Root_Issues ("invalid action rating"), E);
            end if;
            for I in 1..Length(Attrs) loop
               declare Acts:constant JSON_Array:=Get(Get(Attrs,I),"actions");begin
                  for J in 1..Length(Acts) loop
                     declare X:constant JSON_Value:=Get(Acts,J);begin
                        if Str_Field(X,"name")=Name then
                           if Rating > Rating_Cap (E) then
                              return Rating_Maxed_Error
                                (Op, "action rating capped by Mastery",
                                 Rating_Cap (E), Int_Field (X, "rating"), E);
                           end if;
                           Set_Field(X,"rating",Integer'Min(Rating,Int_Field(X,"maxRating")));
                           Found:=True;
                        end if;
                     end;
                  end loop;
               end;
            end loop;
            if not Found then
               return Validation_Error (Op, "unknown action",
                                        Root_Issues ("unknown action"), E);
            end if;
         end;
      elsif Op = "attribute-xp.add" or else Op = "attribute-xp.clear" or else Op="attribute.levelup" then
         declare Attrs:constant JSON_Array:=Get(Get(E,"talent"),"attributes");Name:constant String:=Str_Field(B,"attribute");Found:Boolean:=False;begin for I in 1..Length(Attrs) loop declare A:constant JSON_Value:=Get(Attrs,I);X:constant JSON_Value:=Get(A,"experience");begin if Str_Field(A,"name")=Name then Found:=True;if Op="attribute-xp.clear" then Set_Field(X,"points",Integer'(0));elsif Op="attribute-xp.add" then Requested:=Int_Field(B,"delta");Core_Clamp_Add(Natural(Int_Field(X,"points")),Natural(Int_Field(X,"max")),Natural'Max(0,Requested),New_Value,Applied);Set_Field(X,"points",Integer(New_Value));Effective:=Integer(Applied);else
            --  BUG-004: level-up must run through the proved core semantics —
            --  the attribute XP track must be FULL, and the target action
            --  rating must not exceed its max.
            declare
               use Paperclips_Core.Experience_Trackers;
               Track : Experience_Tracker (Maximum => Paperclips_Core.Capacity (Int_Field (X, "max")));
               Acts  : constant JSON_Array := Get (A, "actions");
               Rating_Max : Natural := 0;
               Tgt : JSON_Value;
               Found_Action : Boolean := False;
            begin
               Add (Track, Natural (Int_Field (X, "points")), Applied);
               for J in 1 .. Length (Acts) loop
                  declare Z : constant JSON_Value := Get (Acts, J); begin
                     if Str_Field (Z, "name") = Str_Field (B, "action") then
                        Tgt := Z; Found_Action := True;
                        Rating_Max := Natural (Int_Field (Z, "maxRating"));
                     end if;
                  end;
               end loop;
               if not Found_Action then
                  return Validation_Error
                    (Op, "unknown action",
                     Root_Issues ("unknown action"), E);
               end if;
               if not Is_Full (Track) then
                  return Cannot_Level_Up_Error
                    (Op, "attribute XP track is not full",
                     Int_Field (X, "max"), Int_Field (X, "points"), E);
               end if;
               if Natural (Int_Field (Tgt, "rating")) >= Rating_Max then
                  return Rating_Maxed_Error
                    (Op, "action rating at its maximum",
                     Integer (Rating_Max), Int_Field (Tgt, "rating"), E);
               end if;
               Set_Field (Tgt, "rating", Int_Field (Tgt, "rating") + 1);
               Set_Field (X, "points", Integer'(0));
            end;
         end if;end if;end;end loop;if not Found then return Validation_Error (Op, "unknown attribute", Root_Issues ("unknown attribute"), E);end if;end;
      elsif Op="ability.take" then
         declare
            P:constant JSON_Value:=(if Kind="character" then Get(E,"playbook") else E);
            Field:constant String:=(if Kind="character" then "abilities" else "specialAbilities");
            A:constant JSON_Array:=Get(P,Field);O:JSON_Array:=A;
            Name:constant String:=Str_Field(B,"name");Found:Boolean:=False;
         begin
            for I in 1..Length(A) loop
               if Str_Field(Get(A,I),"name")=Name then
                  Found:=True;
                  if not Can_Take_More(Kind,Name,E,Int_Field(Get(A,I),"timesTaken")) then
                     return Ability_Maxed_Error
                       (Op, "ability is already taken to its limit",
                        Ability_Take_Limit (Kind, Name, E),
                        Int_Field (Get(A,I),"timesTaken"), E);
                  end if;
                  Set_Field(Get(A,I),"timesTaken",Int_Field(Get(A,I),"timesTaken")+1);
               end if;
            end loop;
            if not Found then declare X:JSON_Value:=Create_Object;begin
               Set_Field(X,"name",Name);
               --  crews carry only name+timesTaken (C# CrewSpecialAbility);
               --  only characters embed the ability description.
               if Kind = "character" then
                  Set_Field(X,"description",Ability_Description(Kind,Name,E));
               end if;
               Set_Field(X,"timesTaken",Integer'(1));
               Append(O,X);Set_Field(P,Field,O);
            end;end if;
         end;
      elsif Op="ability.remove" then
         declare
            P:constant JSON_Value:=(if Kind="character" then Get(E,"playbook") else E);
            Field:constant String:=(if Kind="character" then "abilities" else "specialAbilities");
            A:constant JSON_Array:=(if Has_Field(P,Field) then Get(P,Field) else Empty_Array);
            O:JSON_Array:=Empty_Array;Name:constant String:=Str_Field(B,"name");Found:Boolean:=False;
         begin
            for I in 1..Length(A) loop
               if Str_Field(Get(A,I),"name")=Name then Found:=True;
               else Append(O,Get(A,I));end if;
            end loop;
            if not Found then return Not_Found_Error(Op,"ability not found",E);end if;
            Set_Field(P,Field,O);
         end;
      elsif Op="fund.gain" or else Op="fund.spend" or else Op="fund.liquidate" then declare F:constant JSON_Value:=Get(E,"fund");S:constant JSON_Value:=Get(F,"satchel");Z:constant JSON_Value:=Get(F,"stash");Req:constant Integer:=Int_Field(B,"coins");A1,A2:Integer:=0;begin Requested:=Req;if Op="fund.gain" then A1:=Integer'Min(Req,Int_Field(S,"max")-Int_Field(S,"coins"));Set_Field(S,"coins",Int_Field(S,"coins")+A1);A2:=Integer'Min(Req-A1,Int_Field(Z,"max")-Int_Field(Z,"coins"));Set_Field(Z,"coins",Int_Field(Z,"coins")+A2);Effective:=A1+A2;return Success_Result(Op,E,Requested,Effective,Side=>(if Effective<Requested then Trim_Image(Requested-Effective)&" coin could not be stored" else ""));elsif Op="fund.spend" then
         if Req>Int_Field(S,"coins")+Int_Field(Z,"coins")/2 then return Insufficient_Funds_Error(Op,"not enough coins",Int_Field(S,"coins")+Int_Field(Z,"coins")/2,Req,E);end if;
         A1:=Integer'Min(Req,Int_Field(S,"coins"));Set_Field(S,"coins",Int_Field(S,"coins")-A1);Set_Field(Z,"coins",Int_Field(Z,"coins")-(Req-A1)*2);Effective:=Req;return Success_Result(Op,E,Requested,Effective);
      elsif Op="fund.liquidate" then
         if Req>Int_Field(S,"max")-Int_Field(S,"coins") then return Satchel_Full_Error(Op,"satchel cannot hold that many coins",Int_Field(S,"max"),Int_Field(S,"coins"),E);end if;
         if Int_Field(Z,"coins")/2<Req then return Insufficient_Funds_Error(Op,"not enough stash to liquidate",Int_Field(Z,"coins")/2,Req,E);end if;
         Set_Field(Z,"coins",Int_Field(Z,"coins")-Req*2);Set_Field(S,"coins",Int_Field(S,"coins")+Req);Effective:=Req;return Success_Result(Op,E,Requested,Effective);
      end if;
      end;
      elsif Op="rolodex.add" then declare R:constant JSON_Value:=Get(E,"rolodex");A:constant JSON_Array:=Get(R,"friends");O:JSON_Array:=A;Entry_Name:constant String:=Str_Field(B,"entry");X:JSON_Value:=Create_Object;begin for I in 1..Length(A) loop if Str_Field(Get(A,I),"entry")=Entry_Name then return Duplicate_Error(Op,"rolodex entry already exists",E);end if;end loop;Set_Field(X,"entry",Entry_Name);Set_Field(X,"closeness","friend");Append(O,X);Set_Field(R,"friends",O);end;
      elsif Op="rolodex.set-closeness" then declare A:constant JSON_Array:=Get(Get(E,"rolodex"),"friends");begin for I in 1..Length(A) loop if Str_Field(Get(A,I),"entry")=Str_Field(B,"entry") then Set_Field(Get(A,I),"closeness",Str_Field(B,"closeness","friend"));end if;end loop;end;
      elsif Op="rolodex.remove" then declare A:constant JSON_Array:=Get(Get(E,"rolodex"),"friends");O:JSON_Array:=Empty_Array;Entry_Name:constant String:=Str_Field(B,"entry");Found:Boolean:=False;begin for I in 1..Length(A) loop if Str_Field(Get(A,I),"entry")=Entry_Name then Found:=True;else Append(O,Get(A,I));end if;end loop;if not Found then return Not_Found_Error(Op,"rolodex entry not found",E);end if;Set_Field(Get(E,"rolodex"),"friends",O);end;
      elsif Op="contact.add" then declare A:constant JSON_Array:=(if Has_Field(E,"contacts") then Get(E,"contacts") else Empty_Array);Name:constant String:=Str_Field(B,"name");begin for I in 1..Length(A) loop if Str_Field(Get(A,I),"name")=Name then return Duplicate_Error(Op,"contact already exists",E);end if;end loop;declare X:JSON_Value:=Create_Object;O:JSON_Array:=A;begin Set_Field(X,"name",Name);Set_Field(X,"profession",Str_Field(B,"profession"));Append(O,X);Set_Field(E,"contacts",O);end;end;
      elsif Op="contact.remove" then declare A:constant JSON_Array:=(if Has_Field(E,"contacts") then Get(E,"contacts") else Empty_Array);O:JSON_Array:=Empty_Array;Name:constant String:=Str_Field(B,"name");Found:Boolean:=False;begin for I in 1..Length(A) loop if Str_Field(Get(A,I),"name")=Name then Found:=True;else Append(O,Get(A,I));end if;end loop;if not Found then return Not_Found_Error(Op,"contact not found",E);end if;Set_Field(E,"contacts",O);end;
      elsif Op="faction.set-status" then declare G:constant JSON_Value:=Game(Str_Field(E,"gameStem"));Lo:Integer:=Integer'First;Hi:Integer:=Integer'Last;begin if G.Kind=JSON_Object_Type and then Has_Field(G,"FactionStatus") then declare FS:constant JSON_Value:=Get(G,"FactionStatus");begin Lo:=Int_Field(FS,"Min",Integer'First);Hi:=Int_Field(FS,"Max",Integer'Last);end;end if;declare A:constant JSON_Array:=(if Has_Field(E,"factions") then Get(E,"factions") else Empty_Array);Name:constant String:=Str_Field(B,"name");Found:Boolean:=False;begin Requested:=Int_Field(B,"status");Effective:=Integer'Min(Integer'Max(Requested,Lo),Hi);for I in 1..Length(A) loop if Str_Field(Get(A,I),"name")=Name then Set_Field(Get(A,I),"status",Effective);Found:=True;end if;end loop;if not Found then declare X:JSON_Value:=Create_Object;O:JSON_Array:=A;begin Set_Field(X,"name",Name);Set_Field(X,"status",Effective);Append(O,X);Set_Field(E,"factions",O);end;end if;end;return Success_Result(Op,E,Requested,Effective);end;
      elsif Op="faction.remove" then declare A:constant JSON_Array:=(if Has_Field(E,"factions") then Get(E,"factions") else Empty_Array);O:JSON_Array:=Empty_Array;Name:constant String:=Str_Field(B,"name");Found:Boolean:=False;begin for I in 1..Length(A) loop if Str_Field(Get(A,I),"name")=Name then Found:=True;else Append(O,Get(A,I));end if;end loop;if not Found then return Not_Found_Error(Op,"faction not found",E);end if;Set_Field(E,"factions",O);end;
      elsif Op="dossier.update" then declare D:constant JSON_Value:=Get(E,"dossier");procedure Copy(Name:UTF8_String;Value:JSON_Value)is begin if Has_Field(D,Name) then Set_Field(D,Name,Clone(Value));end if;end;begin if Str_Field(B,"crewId")/="" and then Read_Entity("crew",Str_Field(B,"crewId")).Kind/=JSON_Object_Type then return Validation_Error(Op,"unknown crew",Root_Issues("unknown crew"),E);end if;Map_JSON_Object(B,Copy'Access);end;
      elsif Op = "note.add" or else Op = "note.remove" then
         declare
            P : constant JSON_Value := (if Kind = "character" then Get (E,"dossier") else E);
            A : constant JSON_Array := (if Has_Field (P,"notes") then Get (P,"notes") else Empty_Array);
            O : JSON_Array := Empty_Array; Idx : Natural := 0; Found : Boolean := False;
         begin
            if Op = "note.add" then O := A; Append (O, Create (Str_Field (B,"text")));
            else
               Idx := Natural (Int_Field (B,"index"));
               for I in 1 .. Length (A) loop
                  if I - 1 = Idx then Found := True; else Append (O, Get (A,I)); end if;
               end loop;
               if not Found then return Not_Found_Error (Op,"note index out of range",E); end if;
            end if;
            Set_Field (P,"notes",O);
         end;
      elsif Op = "heat.add" or else Op = "wanted.add" or else Op = "rep.add" then
         declare Name : constant String := (if Op="heat.add" then "heat" elsif Op="wanted.add" then "wanted" else "rep"); begin
            Target:=Get(E,Name);Requested:=Int_Field(B,"delta");
            if Requested >= 0 then Core_Clamp_Add(Natural(Int_Field(Target,"current")),Natural(Int_Field(Target,"max")),Natural(Requested),New_Value,Applied);
            else Core_Clamp_Subtract(Natural(Int_Field(Target,"current")),Natural(Int_Field(Target,"max")),Natural(-Requested),New_Value,Applied); end if;
            Set_Field(Target,"current",Integer(New_Value));Effective:=(if Requested >= 0 then Integer(Applied) else -Integer(Applied));return Success_Result(Op,E,Requested,Effective);
         end;
      elsif Op = "coin.add" or else Op = "stash.add" or else Op = "tier.add" then
         if Kind /= "crew" then return Validation_Error(Op,"crew-only operation",Root_Issues("crew-only operation"),E); end if;
         declare Name : constant String := (if Op="coin.add" then "coin" elsif Op="stash.add" then "stash" else "tier");
            Cur : constant Integer := Int_Field(E,Name); Req : constant Integer := Int_Field(B,"delta");
         begin
            Requested := Req;
            if Req >= 0 then
               New_Value := (if Cur > Integer'Last - Req then Integer'Last else Cur + Req);
               Effective := Integer(New_Value) - Cur;
            else
               New_Value := (if Cur < Integer'First - Req or else Cur + Req <= 0 then 0 else Cur + Req);
               Effective := Integer(New_Value) - Cur;
            end if;
            Set_Field(E,Name,Integer(New_Value));return Success_Result(Op,E,Requested,Effective);
         end;
      elsif Op = "turf.add" then
         if Kind /= "crew" then return Error_Result (Op,"VALIDATION","crew-only operation",E); end if;
         declare Cur : constant Integer := Int_Field (E,"turf"); Req : constant Integer := Int_Field (B,"delta"); begin
            Requested := Req;
            Effective := Integer'Min (Integer'Max (Req, -Cur), 6 - Cur);
            Set_Field (E,"turf",Cur + Effective); return Success_Result (Op,E,Requested,Effective);
         end;
      elsif Op = "xp.add" then
         if Kind /= "crew" then return Validation_Error(Op,"crew-only operation",Root_Issues("crew-only operation"),E); end if;
         Target := Get (E,"experience"); Requested := Int_Field (B,"delta");
         Core_Clamp_Add (Natural (Int_Field (Target,"points")),Natural (Int_Field (Target,"max")),Natural'Max (0,Requested),New_Value,Applied);
         Set_Field (Target,"points",Integer (New_Value)); Effective := Integer (Applied); return Success_Result (Op,E,Requested,Effective);
      elsif Op = "xp.clear" then
         if Kind /= "crew" then return Validation_Error(Op,"crew-only operation",Root_Issues("crew-only operation"),E); end if;
         declare X : constant JSON_Value := Get (E,"experience"); begin Set_Field (X,"points",Integer'(0)); end;
      elsif Op = "clock.progress" then
         declare
            use Paperclips_Core.Clocks;
            C   : Clock_State
              (Size => Paperclips_Core.Capacity (Int_Field (E, "size")));
            Req : constant Natural := Natural'Max (0, Int_Field (B, "segments"));
            App : Natural;
         begin
            C.Kind := (if Str_Field (E, "behavior", "bounded") = "rollover"
                       then Rollover else Project);
            C.Segments := Natural (Int_Field (E, "segments"));
            C.Overflow := Natural (Int_Field (E, "rollover", 0));
            Progress (C, Req, App);
            Set_Field (E, "segments", Integer (C.Segments));
            Set_Field (E, "rollover", Integer (C.Overflow));
            return Success_Result (Op, E);
         end;
      elsif Op = "clock.reset" then
         declare
            use Paperclips_Core.Clocks;
            C : Clock_State
              (Size => Paperclips_Core.Capacity (Int_Field (E, "size")));
         begin
            C.Kind := (if Str_Field (E, "behavior", "bounded") = "rollover"
                       then Rollover else Project);
            C.Segments := Natural (Int_Field (E, "segments"));
            C.Overflow := Natural (Int_Field (E, "rollover", 0));
            Reset (C);
            Set_Field (E, "segments", Integer (C.Segments));
            Set_Field (E, "rollover", Integer (C.Overflow));
            return Success_Result (Op, E);
         end;
      elsif Op = "gear.lock" then declare X : constant JSON_Value := Get(E,"gear"); begin Set_Field(X,"isCommitmentLocked",True); end;
      elsif Op = "gear.unlock" then declare X : constant JSON_Value := Get(E,"gear"); begin Set_Field(X,"isCommitmentLocked",False); end;
      elsif Op = "gear.set-commitment" then
         if Bool_Field(Get(E,"gear"),"isCommitmentLocked") then return Error_Result(Op,"COMMITMENT_LOCKED","commitment is locked",E); end if;
         declare X : constant JSON_Value := Get(E,"gear"); begin Set_Field(X,"commitment",Str_Field(B,"commitment")); end;
      elsif Op = "gear.add" then
         declare G : constant JSON_Value := Get(E,"gear"); A : constant JSON_Array := Get(G,"availableGear"); Name : constant String := Str_Field(B,"name"); begin
            for I in 1..Length(A) loop
               if Str_Field(Get(A,I),"name") = Name then return Duplicate_Error(Op,"item already available",E); end if;
            end loop;
            declare O : JSON_Array := A; X : JSON_Value := Create_Object; begin
               Set_Field(X,"name",Name);Set_Field(X,"bulk",Int_Field(B,"bulk"));Append(O,X);Set_Field(G,"availableGear",O);
            end;
         end;
      elsif Op = "gear.remove" then
         declare G : constant JSON_Value := Get(E,"gear"); A : constant JSON_Array := Get(G,"availableGear"); L : constant JSON_Array := Get(G,"loadout"); Name : constant String := Str_Field(B,"name"); Found : Boolean := False; begin
            for I in 1..Length(A) loop
               if Str_Field(Get(A,I),"name") = Name then Found := True; end if;
            end loop;
            for I in 1..Length(L) loop
               if Str_Field(Get(L,I),"name") = Name then Found := True; end if;
            end loop;
            if not Found then return Not_Found_Error(Op,"item not found",E); end if;
            declare O : JSON_Array := Empty_Array; M : JSON_Array := Empty_Array; begin
               for I in 1..Length(A) loop
                  if Str_Field(Get(A,I),"name") /= Name then Append(O,Get(A,I)); end if;
               end loop;
               for I in 1..Length(L) loop
                  if Str_Field(Get(L,I),"name") /= Name then Append(M,Get(L,I)); end if;
               end loop;
               Set_Field(G,"availableGear",O);Set_Field(G,"loadout",M);
            end;
         end;
      elsif Op = "gear.commit" then
         declare G : constant JSON_Value := Get(E,"gear"); A : constant JSON_Array := Get(G,"availableGear"); L : constant JSON_Array := Get(G,"loadout"); Name : constant String := Str_Field(B,"name"); Item : JSON_Value := JSON_Null; begin
            if Bool_Field(G,"isCommitmentLocked") then return Commitment_Locked_Error(Op,"commitment is locked",E); end if;
            for I in 1..Length(A) loop
               if Str_Field(Get(A,I),"name") = Name then Item := Get(A,I); exit; end if;
            end loop;
            if Item.Kind = JSON_Null_Type then return Not_Found_Error(Op,"item not available",E); end if;
            if Str_Field(G,"commitment") = "" or else Str_Field(G,"commitment") = "none" then return No_Commitment_Error(Op,"no commitment set",E); end if;
            for I in 1..Length(L) loop
               if Str_Field(Get(L,I),"name") = Name then return Duplicate_Error(Op,"item already committed",E); end if;
            end loop;
            declare
               Sum : Integer := 0;
               --  SC-A3: capacity derives from the committed load level
               --  (settings LoadMaxima.CommitmentMaxBulk, C# fallback), not
               --  from a stored maxBulk literal.
               Capacity : constant Integer :=
                 Commitment_Max_Bulk
                   ((To_Unbounded_String (Str_Field (E, "gameStem")),
                     Game (Str_Field (E, "gameStem"))),
                    Str_Field (G, "commitment"));
            begin
               for I in 1..Length(L) loop Sum := Sum + Int_Field(Get(L,I),"bulk"); end loop;
               if Int_Field(Item,"bulk") > Capacity - Sum then
                  return Over_Bulk_Error(Op,"item exceeds bulk limit",Capacity,Sum,E);
               end if;
            end;
            declare O : JSON_Array := L; begin Append(O,Item);Set_Field(G,"loadout",O); end;
         end;
      elsif Op = "gear.uncommit" then
         declare G : constant JSON_Value := Get(E,"gear"); L : constant JSON_Array := Get(G,"loadout"); Name : constant String := Str_Field(B,"name"); Found : Boolean := False; begin
            if Bool_Field(G,"isCommitmentLocked") then return Commitment_Locked_Error(Op,"commitment is locked",E); end if;
            for I in 1..Length(L) loop
               if Str_Field(Get(L,I),"name") = Name then Found := True; end if;
            end loop;
            if not Found then return Not_Found_Error(Op,"item not in loadout",E); end if;
            declare O : JSON_Array := Empty_Array; begin
               for I in 1..Length(L) loop
                  if Str_Field(Get(L,I),"name") /= Name then Append(O,Get(L,I)); end if;
               end loop;
               Set_Field(G,"loadout",O);
            end;
         end;
      elsif Op = "gear.clear-commitments" then
         declare G : constant JSON_Value := Get(E,"gear"); begin
            if Bool_Field(G,"isCommitmentLocked") then return Commitment_Locked_Error(Op,"commitment is locked",E); end if;
            Set_Field(G,"loadout",Empty_Array);Set_Field(G,"commitment","none");
         end;
      elsif Op = "notebook.set" then Set_Field(E,"notebook",Str_Field(B,"text"));
      elsif Op = "hold.set" then Set_Field(E,"hold",Str_Field(B,"hold","weak"));
      elsif Op = "cohort.add" then
         declare Kind_Of : constant String := Str_Field(B,"cohortKind"); begin
            if Kind_Of /= "gang" and then Kind_Of /= "expert" then
               return Validation_Error (Op, "cohortKind must be gang or expert",
                                        Root_Issues ("cohortKind must be gang or expert"), E);
            end if;
            declare A : constant JSON_Array := Get(E,"cohorts"); O : JSON_Array := A; X : JSON_Value := Create_Object; begin
               Set_Field(X,"id",New_Id);Set_Field(X,"cohortKind",Kind_Of);
               Set_Field(X,"gangType",Str_Field(B,"gangType"));Set_Field(X,"expertType",Str_Field(B,"expertType"));
               Set_Field(X,"quality",Int_Field(B,"quality"));Set_Field(X,"scale",Int_Field(B,"scale"));
               Set_Field(X,"hasArmor",Bool_Field(B,"hasArmor"));
               Set_Field(X,"edges",(if Has_Field(B,"edges") then Get(B,"edges") else Empty_List));
               Set_Field(X,"flaws",(if Has_Field(B,"flaws") then Get(B,"flaws") else Empty_List));
               Set_Field(X,"harm","healthy");Set_Field(X,"description",Str_Field(B,"description"));
               Append(O,X);Set_Field(E,"cohorts",O);
            end;
         end;
      elsif Op = "cohort.remove" then
         declare A : constant JSON_Array := Get(E,"cohorts"); O : JSON_Array := Empty_Array;
            Id : constant String := Str_Field(B,"cohortId"); Found : Boolean := False;
         begin
            for I in 1..Length(A) loop
               if Str_Field(Get(A,I),"id") = Id then Found := True;
               else Append(O,Get(A,I)); end if;
            end loop;
            if not Found then return Not_Found_Error(Op,"cohort not found",E); end if;
            Set_Field(E,"cohorts",O);
         end;
      elsif Op = "cohort.update" then
         declare A : constant JSON_Array := Get(E,"cohorts"); Id : constant String := Str_Field(B,"cohortId"); Found : Boolean := False; begin
            for I in 1..Length(A) loop
               if Str_Field(Get(A,I),"id") = Id then
                  Found := True;
                  declare C : constant JSON_Value := Get(A,I);
                     procedure Copy (Name : UTF8_String; Value : JSON_Value) is
                     begin
                        if Has_Field(C,Name) then Set_Field(C,Name,Clone(Value)); end if;
                     end Copy;
                  begin
                     Map_JSON_Object (B, Copy'Access);
                  end;
               end if;
            end loop;
            if not Found then return Not_Found_Error(Op,"cohort not found",E); end if;
         end;
      elsif Op = "session.set" then
         declare
            S : constant JSON_Value := Get (E, "session");
            Max : constant Integer := Int_Field (S, "max", 3);
            Allowed : Boolean := True;
            procedure Check (Name : UTF8_String; Value : JSON_Value) is
            begin
               if Name /= "playbookExpressions" and then Name /= "characterExpressions"
                 and then Name /= "struggleExpressions" then Allowed := False; end if;
            end Check;
         begin
            Map_JSON_Object (B, Check'Access);
            if not Allowed then return Validation_Error (Op, "unknown field", Root_Issues ("unknown field"), E); end if;
            if Has_Field (B, "playbookExpressions") then
               Requested := Int_Field (B, "playbookExpressions");
               Core_Clamp_Add (0, Natural (Max), Natural'Max (0, Requested), New_Value, Applied);
               Set_Field (S, "playbookExpressions", Integer (New_Value));
               Effective := Integer (Applied);
            end if;
            if Has_Field (B, "characterExpressions") then
               Requested := Int_Field (B, "characterExpressions");
               Core_Clamp_Add (0, Natural (Max), Natural'Max (0, Requested), New_Value, Applied);
               Set_Field (S, "characterExpressions", Integer (New_Value));
               Effective := Integer (Applied);
            end if;
            if Has_Field (B, "struggleExpressions") then
               Requested := Int_Field (B, "struggleExpressions");
               Core_Clamp_Add (0, Natural (Max), Natural'Max (0, Requested), New_Value, Applied);
               Set_Field (S, "struggleExpressions", Integer (New_Value));
               Effective := Integer (Applied);
            end if;
            return Success_Result (Op, E, Requested, Effective);
         end;
      elsif Op="upgrade.mark" or else Op="upgrade.unmark" then declare A:constant JSON_Array:=Get(E,"upgrades");O:JSON_Array:=Empty_Array;Name:constant String:=Str_Field(B,"name");Found:Boolean:=False;begin for I in 1..Length(A) loop declare X:constant JSON_Value:=Get(A,I);begin if Str_Field(X,"name")=Name then Found:=True;if Op="upgrade.mark" and then Int_Field(X,"boxesMarked")>=Upgrade_Total_Boxes(E,Name) then return Upgrade_Maxed_Error(Op,"upgrade is at its total box count",Upgrade_Total_Boxes(E,Name),Int_Field(X,"boxesMarked"),E);end if;declare N:constant Integer:=Int_Field(X,"boxesMarked")+(if Op="upgrade.mark" then 1 else -1);begin if N>0 then Set_Field(X,"boxesMarked",N);Append(O,X);end if;end;else Append(O,X);end if;end;end loop;if Op="upgrade.mark" and then not Found then declare X:JSON_Value:=Create_Object;begin Set_Field(X,"name",Name);Set_Field(X,"boxesMarked",Integer'(1));Append(O,X);end;end if;Set_Field(E,"upgrades",O);end;
      elsif Op = "fields.update" then
         declare procedure Copy_Field (Name : UTF8_String; Value : JSON_Value) is begin if Has_Field(E,Name) then Set_Field(E,Name,Clone(Value)); end if; end; begin Map_JSON_Object(B,Copy_Field'Access); end;
      elsif Op = "harm.healing-clock" then
         declare H:constant JSON_Value:=Get(Get(E,"monitor"),"harm");C:constant JSON_Value:=Get(H,"healingClock");begin
            Requested:=Int_Field(B,"segments");
            Core_Clamp_Add(Natural(Int_Field(C,"segments")),Natural(Int_Field(C,"size")),Natural'Max(0,Requested),New_Value,Applied);
            Set_Field(C,"segments",Integer(New_Value));
            Set_Field(C,"rollover",Integer((if Applied<Natural'Max(0,Requested) then Natural'Max(0,Requested)-Applied else 0)));
            return Success_Result(Op,E);
         end;
      elsif Op = "harm.heal" then
         declare H:constant JSON_Value:=Get(Get(E,"monitor"),"harm");C:constant JSON_Value:=Get(H,"healingClock");Level:constant String:=Str_Field(B,"intensity");Desc:constant String:=Str_Field(B,"description");begin
            if Int_Field(C,"segments")<Int_Field(C,"size") then return Cannot_Heal_Error(Op,"healing clock is not full",Int_Field(C,"size"),Int_Field(C,"segments"),E);end if;
            declare A:constant JSON_Array:=Get(H,Level);O:JSON_Array:=Empty_Array;Skipped:Boolean:=False;begin
               for I in 1..Length(A) loop
                  if not Skipped and then String'(Get(Get(A,I)))=Desc then Skipped:=True;else Append(O,Get(A,I));end if;
               end loop;
               if not Skipped then return Not_Found_Error(Op,"harm not found",E);end if;
               Set_Field(H,Level,O);
            end;
            declare R:constant Integer:=Int_Field(C,"rollover");begin
               Set_Field(C,"segments",Integer'Min(R,Int_Field(C,"size")));
               Set_Field(C,"rollover",(if R>Int_Field(C,"size") then R-Int_Field(C,"size") else 0));
            end;
            Set_Field(E,"isDeadish",Array_Length(H,"fatal")>0);return Success_Result(Op,E);
         end;
      elsif Op = "claim.set" then
         --  Crew Claims: acquire/relinquish a claim.  The Lair and unknown
         --  claim IDs are rejected atomically; repeated state is a no-op.
         if Kind /= "crew" then
            return Validation_Error (Op, "crew-only operation", Root_Issues ("crew-only operation"), E);
         end if;
         declare
            Claim_Id : constant String := Str_Field (B, "claimId");
            Claimed  : constant Boolean := Bool_Field (B, "claimed");
            Is_Lair  : Boolean;
         begin
            if not Claim_Exists (E, Claim_Id, Is_Lair) then
               return Validation_Error (Op, "unknown claim", Root_Issues ("unknown claim"), E);
            end if;
            if Is_Lair then
               return Validation_Error (Op, "the lair is always controlled",
                                        Root_Issues ("the lair is always controlled"), E);
            end if;
            declare
               A : constant JSON_Array :=
                 (if Has_Field (E, "claimedClaimIds") then Get (E, "claimedClaimIds")
                  else Empty_Array);
               Found : Boolean := False;
               O     : JSON_Array := Empty_Array;
            begin
               for I in 1 .. Length (A) loop
                  declare S : constant UTF8_String := Get (Get (A, I)); begin
                     if S = Claim_Id then Found := True; end if;
                  end;
               end loop;
               if Claimed and then not Found then
                  Append (O, Create (Claim_Id));
                  Set_Field (E, "claimedClaimIds", O);
               elsif not Claimed and then Found then
                  for I in 1 .. Length (A) loop
                     declare S : constant UTF8_String := Get (Get (A, I)); begin
                        if S /= Claim_Id then
                           Append (O, Get (A, I));
                        end if;
                     end;
                  end loop;
                  Set_Field (E, "claimedClaimIds", O);
               end if;
            end;
         end;
      elsif Op = "claim.customize" then
         --  Crew Claims: write/merge a per-crew override for a canonical
         --  claim (name/description/effects inherit unless overridden).
         if Kind /= "crew" then
            return Validation_Error (Op, "crew-only operation", Root_Issues ("crew-only operation"), E);
         end if;
         declare
            Claim_Id : constant String := Str_Field (B, "claimId");
            Is_Lair  : Boolean;
            Ovs      : JSON_Array :=
              (if Has_Field (E, "claimOverrides") then Get (E, "claimOverrides")
               else Empty_Array);
            Found    : Boolean := False;
         begin
            if not Claim_Exists (E, Claim_Id, Is_Lair) then
               return Validation_Error (Op, "unknown claim", Root_Issues ("unknown claim"), E);
            end if;
            if Is_Lair then
               return Validation_Error (Op, "the lair cannot be customized",
                                        Root_Issues ("the lair cannot be customized"), E);
            end if;
            for I in 1 .. Length (Ovs) loop
               if Str_Field (Get (Ovs, I), "claimId") = Claim_Id then
                  --  merge supplied fields into the existing override
                  if Has_Field (B, "name") then Set_Field (Get (Ovs, I), "name", Str_Field (B, "name")); end if;
                  if Has_Field (B, "description") then Set_Field (Get (Ovs, I), "description", Str_Field (B, "description")); end if;
                  if Has_Field (B, "effects") then Set_Field (Get (Ovs, I), "effects", Clone (Get (B, "effects"))); end if;
                  Found := True;
               end if;
            end loop;
            if not Found then
               declare X : JSON_Value := Create_Object; begin
                  Set_Field (X, "claimId", Claim_Id);
                  if Has_Field (B, "name") then Set_Field (X, "name", Str_Field (B, "name")); end if;
                  if Has_Field (B, "description") then Set_Field (X, "description", Str_Field (B, "description")); end if;
                  if Has_Field (B, "effects") then Set_Field (X, "effects", Clone (Get (B, "effects"))); end if;
                  Append (Ovs, X);
               end;
            end if;
            Set_Field (E, "claimOverrides", Ovs);
         end;
      elsif Op = "claim.reset" then
         --  Crew Claims: delete the override for a claim, restoring defaults.
         if Kind /= "crew" then
            return Validation_Error (Op, "crew-only operation", Root_Issues ("crew-only operation"), E);
         end if;
         declare
            Claim_Id : constant String := Str_Field (B, "claimId");
            Is_Lair  : Boolean;
            Ovs      : JSON_Array :=
              (if Has_Field (E, "claimOverrides") then Get (E, "claimOverrides")
               else Empty_Array);
            O        : JSON_Array := Empty_Array;
         begin
            if not Claim_Exists (E, Claim_Id, Is_Lair) then
               return Validation_Error (Op, "unknown claim", Root_Issues ("unknown claim"), E);
            end if;
            for I in 1 .. Length (Ovs) loop
               if Str_Field (Get (Ovs, I), "claimId") /= Claim_Id then
                  Append (O, Get (Ovs, I));
               end if;
            end loop;
            Set_Field (E, "claimOverrides", O);
         end;
      elsif Op = "end-score" then
         --  BUG-005: composite helper — explicit flags only, one snapshot.
         if Kind /= "character" then
            return Validation_Error (Op, "character-only operation",
                                     Root_Issues ("character-only operation"), E);
         end if;
         --  LIFECYCLE-ENDSCORE-001: end-score can never erase an unresolved
         --  pending trauma.
         if Bool_Field (E, "traumaPending") then
            return Trauma_Required_Error
              (Op, "pending trauma must be resolved before end-score", E);
         end if;
         if Bool_Field (B, "clearArmorUsed", False) then
            declare A : constant JSON_Value := Get (Get (E, "monitor"), "armor"); begin
               Set_Field (A, "standardUsed", False);
               Set_Field (A, "heavyUsed", False);
               Set_Field (A, "specialUsed", False);
            end;
         end if;
         if Bool_Field (B, "resetLoadoutCommitment", False) then
            declare G : constant JSON_Value := Get (E, "gear"); begin
               if Bool_Field (G, "isCommitmentLocked") then
                  return Commitment_Locked_Error (Op, "commitment is locked", E);
               end if;
               Set_Field (G, "loadout", Empty_Array);
               Set_Field (G, "commitment", "none");
            end;
         end if;
         --  W15: a successful end-score always clears stress and releases
         --  the out-of-action state.
         Set_Field (Get (Get (E, "monitor"), "stress"), "current", Integer'(0));
         Set_Field (E, "isOutOfAction", False);
         Set_Field (E, "stressClearPending", False);
      elsif Op = "retire" then
         --  Q33: explicit retirement — confirmation-guarded, legal in any
         --  state below maximum trauma; already-retired is caught by the
         --  top gate (RETIRED).
         if Kind /= "character" then
            return Validation_Error (Op, "character-only operation",
                                     Root_Issues ("character-only operation"), E);
         end if;
         if not Bool_Field (B, "confirm") then
            return Confirm_Required_Error (Op, "confirm must be true", E);
         end if;
         Retire_Character;
      elsif Op = "end-downtime" then
         --  BUG-005: composite helper — clears session expressions and applies
         --  caller-supplied vice relief (GM judgment stays outside).
         if Kind /= "character" then
            return Validation_Error (Op, "character-only operation",
                                     Root_Issues ("character-only operation"), E);
         end if;
         declare
            S : constant JSON_Value := Get (E, "session");
         begin
            if Bool_Field (B, "clearSessionExpressions", False) then
               Set_Field (S, "playbookExpressions", Integer'(0));
               Set_Field (S, "characterExpressions", Integer'(0));
               Set_Field (S, "struggleExpressions", Integer'(0));
            end if;
         end;
         if Has_Field (B, "viceReliefStress") then
            declare
               M  : constant JSON_Value := Get (Get (E, "monitor"), "stress");
               Req : constant Integer := Int_Field (B, "viceReliefStress");
            begin
               if Req < 0 then
                  return Validation_Error
                    (Op, "viceReliefStress must be non-negative",
                     Root_Issues ("viceReliefStress must be non-negative"), E);
               end if;
               Requested := Req;
               Core_Clamp_Subtract (Natural (Int_Field (M, "current")),
                                    Natural (Int_Field (M, "max")),
                                    Natural (Req), New_Value, Applied);
               Set_Field (M, "current", Integer (New_Value));
               Effective := -Integer (Applied);
            end;
         end if;
      else return Validation_Error (Op,"unknown operation",Root_Issues ("unknown operation"),E);
      end if;
      --  BUG-006: armor availability is derived; refresh the stored flags
      --  after any gear or ability mutation.
      if Kind = "character" and then
        (Op = "gear.add" or else Op = "gear.remove" or else Op = "gear.commit"
         or else Op = "gear.uncommit" or else Op = "gear.clear-commitments"
         or else Op = "ability.take" or else Op = "ability.remove")
      then
         declare A : constant JSON_Value := Get (Get (E, "monitor"), "armor"); begin
            Set_Field (A, "hasStandard", Armor_Available (E, "standard"));
            Set_Field (A, "hasHeavy", Armor_Available (E, "heavy"));
            Set_Field (A, "hasSpecial", Armor_Available (E, "special"));
         end;
      end if;
      return Success_Result (Op,E,Requested,Effective);
   exception when Constraint_Error =>
      return Validation_Error (Op, "invalid operation arguments",
                               Root_Issues ("invalid operation arguments"), E);
   end Mutate;

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

   --  BUG-012: collection endpoints project declared summaries.
   function Character_Summary (C : JSON_Value) return JSON_Value is
      D : constant JSON_Value := Get (C, "dossier");
      M : constant JSON_Value := Get (C, "monitor");
      X : JSON_Value := Create_Object;
      T : constant JSON_Value := Get (Get (M, "trauma"), "traumas");
   begin
      Set_Field (X, "id", Str_Field (C, "id"));
      Set_Field (X, "name", Str_Field (D, "name"));
      Set_Field (X, "alias", Str_Field (D, "alias"));
      Set_Field (X, "playbook", Str_Field (Get (C, "playbook"), "name"));
      Set_Field (X, "gameStem", Str_Field (C, "gameStem"));
      Set_Field (X, "crewId", Str_Field (D, "crewId"));
      Set_Field (X, "stress", Int_Field (Get (M, "stress"), "current"));
      Set_Field (X, "traumas", T);
      Set_Field (X, "isRetired", Bool_Field (C, "isRetired"));
      Set_Field (X, "isDeadish", Bool_Field (C, "isDeadish"));
      Set_Field (X, "revision", Int_Field (C, "revision"));
      return X;
   end Character_Summary;

   function Crew_Summary (C : JSON_Value; All_Chars : JSON_Array) return JSON_Value is
      X : JSON_Value := Create_Object;
      Members : Natural := 0;
   begin
      for J in 1 .. Length (All_Chars) loop
         if Str_Field (Get (Get (All_Chars, J), "dossier"), "crewId") =
           Str_Field (C, "id")
         then
            Members := Members + 1;
         end if;
      end loop;
      Set_Field (X, "id", Str_Field (C, "id"));
      Set_Field (X, "name", Str_Field (C, "name"));
      Set_Field (X, "crewType", Str_Field (C, "crewTypeName"));
      Set_Field (X, "gameStem", Str_Field (C, "gameStem"));
      Set_Field (X, "tier", Int_Field (C, "tier"));
      Set_Field (X, "heat", Int_Field (Get (C, "heat"), "current"));
      Set_Field (X, "wanted", Int_Field (Get (C, "wanted"), "current"));
      Set_Field (X, "rep", Int_Field (Get (C, "rep"), "current"));
      Set_Field (X, "hold", Str_Field (C, "hold"));
      Set_Field (X, "memberCount", Integer (Members));
      Set_Field (X, "revision", Int_Field (C, "revision"));
      return X;
   end Crew_Summary;

   --  SC-A4: one degraded summary row (total-collection rule E11 + the R0
   --  matrix D9/D10 rows).  The row keeps the SAME summary schema as valid
   --  rows with canonical empties where the data is unreadable: route-
   --  derived id/kind (Q15 — the directory is authoritative), zeroed
   --  fields, isReadable:false, isRepairable (true for parseable-repairable
   --  / needs-input outcomes, false for unreadable bytes), isComplete:false,
   --  and deleteToken = sha256:<lowercase hex> of the CURRENT raw bytes
   --  (the degraded row's If-Match value; pattern ^sha256:[0-9a-f]{64}$).
   --  Read-only: never writes.
   function Degraded_Row
     (Kind, Id : String; Bytes : String; Repairable : Boolean)
      return JSON_Value
   is
      X : JSON_Value := Create_Object;
   begin
      Set_Field (X, "kind", Kind);
      Set_Field (X, "id", Id);
      if Kind = "character" then
         Set_Field (X, "name", "");
         Set_Field (X, "alias", "");
         Set_Field (X, "playbook", "");
         Set_Field (X, "gameStem", "");
         Set_Field (X, "crewId", "");
         Set_Field (X, "stress", Integer'(0));
         Set_Field (X, "traumas", Empty_Array);
         Set_Field (X, "isRetired", False);
         Set_Field (X, "isDeadish", False);
      else
         Set_Field (X, "name", "");
         Set_Field (X, "crewType", "");
         Set_Field (X, "gameStem", "");
         Set_Field (X, "tier", Integer'(0));
         Set_Field (X, "heat", Integer'(0));
         Set_Field (X, "wanted", Integer'(0));
         Set_Field (X, "rep", Integer'(0));
         Set_Field (X, "hold", "strong");
         Set_Field (X, "memberCount", Integer'(0));
      end if;
      Set_Field (X, "revision", Integer'(1));
      Set_Field (X, "isReadable", False);
      Set_Field (X, "isRepairable", Repairable);
      Set_Field (X, "isComplete", False);
      Set_Field (X, "deleteToken", Content_Token (Bytes));
      return X;
   end Degraded_Row;

   --  SC-W4: completeness derivation (contract x-requiredWhenComplete:
   --  contract/schemas/character.json, contract/schemas/crew.json; wave0
   --  completeness-audit.mdx).  isComplete is computed at RESPONSE TIME from
   --  the frozen pointer lists using the nonBlankString predicate (at least
   --  one non-whitespace character): a row is complete iff every pointer's
   --  value satisfies the predicate.  A missing or non-string pointer value
   --  is a predicate failure (incomplete), matching the generated evaluator
   --  (frontend/src/schema/generated/completeness.ts).  Never stored — the
   --  checksum guards (COMPLETE-NOSTORE-010) pin that stored bytes are
   --  stable across roster reads.  Lifecycle-orthogonal (R5 matrix):
   --  retired/deadish entities use the SAME computation.
   function Obj_Field (V : JSON_Value; Name : String) return JSON_Value is
     (if V.Kind = JSON_Object_Type then Get (V, Name) else JSON_Null);

   function Non_Blank_String (S : String) return Boolean is
   begin
      for I in S'Range loop
         case S (I) is
            when ' ' | ASCII.HT | ASCII.LF | ASCII.CR | ASCII.VT | ASCII.FF =>
               null;
            when others =>
               return True;
         end case;
      end loop;
      return False;
   end Non_Blank_String;

   --  8 frozen character pointers: /dossier/name, /dossier/alias,
   --  /dossier/look, /dossier/heritage/name, /dossier/background/name,
   --  /dossier/vice/name, /dossier/vice/purveyor/name, /playbook/name.
   function Character_Is_Complete (E : JSON_Value) return Boolean is
      D : constant JSON_Value := Obj_Field (E, "dossier");
      V : constant JSON_Value := Obj_Field (D, "vice");
   begin
      return E.Kind = JSON_Object_Type
        and then Non_Blank_String (Str_Field (D, "name"))
        and then Non_Blank_String (Str_Field (D, "alias"))
        and then Non_Blank_String (Str_Field (D, "look"))
        and then Non_Blank_String (Str_Field (Obj_Field (D, "heritage"), "name"))
        and then Non_Blank_String (Str_Field (Obj_Field (D, "background"), "name"))
        and then Non_Blank_String (Str_Field (V, "name"))
        and then Non_Blank_String (Str_Field (Obj_Field (V, "purveyor"), "name"))
        and then Non_Blank_String (Str_Field (Obj_Field (E, "playbook"), "name"));
   end Character_Is_Complete;

   --  5 frozen crew pointers: /name, /crewTypeName, /lair, /reputation,
   --  /huntingGrounds.
   function Crew_Is_Complete (E : JSON_Value) return Boolean is
   begin
      return E.Kind = JSON_Object_Type
        and then Non_Blank_String (Str_Field (E, "name"))
        and then Non_Blank_String (Str_Field (E, "crewTypeName"))
        and then Non_Blank_String (Str_Field (E, "lair"))
        and then Non_Blank_String (Str_Field (E, "reputation"))
        and then Non_Blank_String (Str_Field (E, "huntingGrounds"));
   end Crew_Is_Complete;

   --  SC-A4: one degraded clock list row.  The clock list schema is the
   --  full Clock DTO (no clock summary exists), so an unreadable clock is
   --  listed in the canonical-empty clock shape: route-derived identity,
   --  zeroed fields, and the neutral behavior/ownership defaults.  The raw
   --  bytes are never parsed into the row.  Read-only: never writes.
   function Degraded_Clock_Row (Id : String) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      Set_Field (X, "kind", "clock");
      Set_Field (X, "id", Id);
      Set_Field (X, "revision", Integer'(1));
      Set_Field (X, "formatVersion", Integer'(1));
      Set_Field (X, "createdAt", Now);
      Set_Field (X, "updatedAt", Now);
      Set_Field (X, "name", "");
      Set_Field (X, "ownerKind", "campaign");
      Set_Field (X, "ownerId", "");
      Set_Field (X, "purpose", "custom");
      Set_Field (X, "behavior", "bounded");
      Set_Field (X, "segments", Integer'(0));
      Set_Field (X, "size", Integer'(1));
      Set_Field (X, "rollover", Integer'(0));
      Set_Field (X, "relatedClockIds", Empty_Array);
      return X;
   end Degraded_Clock_Row;

   --  SC-A4: the ONE character-row projection shared by the roster, the
   --  list endpoint, and the members endpoint.  Every directory route is
   --  listed (Q15): canonical rows carry the declared summary fields plus
   --  isReadable/isRepairable true and the canonical empty deleteToken;
   --  degraded rows keep the same schema via Degraded_Row.  One unreadable
   --  member never removes valid rows and never changes the 200 status.
   --  Read-only: never writes.
   function Character_Rows return JSON_Array is
      CA : constant JSON_Array := Entity_Ids ("character");
      O  : JSON_Array := Empty_Array;
   begin
      for I in 1 .. Length (CA) loop
         declare
            Rid : constant String := Get (Get (CA, I));
         begin
            --  skip rows whose current.json is not yet visible (a
            --  concurrent create is mid-atomic-write)
            if Ada.Directories.Exists (Current_File ("character", Rid)) then
               declare
                  Bytes : constant String :=
                    Read_File (Current_File ("character", Rid));
                  E, Ctx : JSON_Value;
                  Iss    : JSON_Array;
                  Can    : Boolean;
                  X      : JSON_Value;
               begin
                  Classify_Stored ("character", Rid, Bytes, E, Ctx, Iss, Can);
                  if Can then
                     X := Character_Summary (E);
                     Set_Field (X, "kind", "character");
                     Set_Field (X, "isReadable", True);
                     Set_Field (X, "isRepairable", True);
                     Set_Field (X, "isComplete", Character_Is_Complete (E));
                     Set_Field (X, "deleteToken", "");
                  else
                     X := Degraded_Row
                       ("character", Rid, Bytes,
                        Str_Field (Ctx, "outcome") /= "unreadable");
                  end if;
                  Append (O, X);
               end;
            end if;
         end;
      end loop;
      return O;
   end Character_Rows;

   --  SC-A4: the ONE crew-row projection (roster + list endpoint), sharing
   --  the character rows for member counting.  Same total-collection rules
   --  as Character_Rows.  Read-only: never writes.
   function Crew_Rows (CC : JSON_Array) return JSON_Array is
      CR : constant JSON_Array := Entity_Ids ("crew");
      O  : JSON_Array := Empty_Array;
   begin
      for I in 1 .. Length (CR) loop
         declare
            Rid : constant String := Get (Get (CR, I));
         begin
            if Ada.Directories.Exists (Current_File ("crew", Rid)) then
               declare
                  Bytes : constant String :=
                    Read_File (Current_File ("crew", Rid));
                  E, Ctx : JSON_Value;
                  Iss    : JSON_Array;
                  Can    : Boolean;
                  X      : JSON_Value;
                  Members : Natural := 0;
               begin
                  Classify_Stored ("crew", Rid, Bytes, E, Ctx, Iss, Can);
                  for J in 1 .. Length (CC) loop
                     if Str_Field (Get (CC, J), "crewId") = Rid then
                        Members := Members + 1;
                     end if;
                  end loop;
                  if Can then
                     X := Crew_Summary (E, Empty_Array);
                     Set_Field (X, "kind", "crew");
                     Set_Field (X, "memberCount", Integer (Members));
                     Set_Field (X, "isReadable", True);
                     Set_Field (X, "isRepairable", True);
                     Set_Field (X, "isComplete", Crew_Is_Complete (E));
                     Set_Field (X, "deleteToken", "");
                  else
                     X := Degraded_Row
                       ("crew", Rid, Bytes,
                        Str_Field (Ctx, "outcome") /= "unreadable");
                     Set_Field (X, "memberCount", Integer (Members));
                  end if;
                  Append (O, X);
               end;
            end if;
         end;
      end loop;
      return O;
   end Crew_Rows;

   --  SC-A4: the ONE clock-row projection (list endpoint).  Canonical
   --  clocks are served as their stored DTO; degraded clocks stay listed as
   --  canonical-empty clock rows (route identity).  Read-only: never writes.
   function Clock_Rows return JSON_Array is
      CA : constant JSON_Array := Entity_Ids ("clock");
      O  : JSON_Array := Empty_Array;
   begin
      for I in 1 .. Length (CA) loop
         declare
            Rid : constant String := Get (Get (CA, I));
         begin
            if Ada.Directories.Exists (Current_File ("clock", Rid)) then
               declare
                  Bytes : constant String :=
                    Read_File (Current_File ("clock", Rid));
                  E, Ctx : JSON_Value;
                  Iss    : JSON_Array;
                  Can    : Boolean;
               begin
                  Classify_Stored ("clock", Rid, Bytes, E, Ctx, Iss, Can);
                  if Can then
                     Append (O, E);
                  else
                     Append (O, Degraded_Clock_Row (Rid));
                  end if;
               end;
            end if;
         end;
      end loop;
      return O;
   end Clock_Rows;

   --  SC-A3/SC-A4: the roster projection shares the stored-entity
   --  classification path.  Every row keeps the frozen summary schema and
   --  the route-derived identity (Q15); degraded rows carry canonical
   --  empties, isReadable:false, isRepairable, isComplete:false, and the
   --  raw-byte deleteToken.  Read-only: never writes.
   function Roster_Value return JSON_Value is
      CC : constant JSON_Array := Character_Rows;
      V  : JSON_Value := Create_Object;
   begin
      Set_Field (V, "characters", CC);
      Set_Field (V, "crews", Crew_Rows (CC));
      return V;
   end Roster_Value;

   --  SC-A5: capability projections (contract/openapi.yaml
   --  CharacterCapabilities / CrewCapabilities).  Advisory only — the
   --  mutation endpoints remain authoritative.  Every limit value is read
   --  from the validated game settings; nothing here is persisted and no
   --  capability literal lives in these functions.
   procedure Mastery_State (E : JSON_Value; Total, Marked : out Integer) is
      Crew_Id : constant String := Str_Field (Get (E, "dossier"), "crewId");
   begin
      Total := 0;
      Marked := 0;
      if Crew_Id = "" then return; end if;
      declare
         Crew : constant JSON_Value := Read_Entity ("crew", Crew_Id);
      begin
         if Crew.Kind /= JSON_Object_Type then return; end if;
         declare
            G : constant JSON_Value :=
              Game (Str_Field (Crew, "gameStem") & "-crews");
         begin
            if G.Kind = JSON_Object_Type and then Has_Field (G, "CrewTypes") then
               declare
                  Types : constant JSON_Array := Get (G, "CrewTypes");
               begin
                  for I in 1 .. Length (Types) loop
                     declare T : constant JSON_Value := Get (Types, I); begin
                        if Str_Field (T, "Name") = Str_Field (Crew, "crewTypeName")
                          and then Has_Field (T, "Upgrades")
                        then
                           declare
                              Up : constant JSON_Array := Get (T, "Upgrades");
                           begin
                              for J in 1 .. Length (Up) loop
                                 if Str_Field (Get (Up, J), "Name") = "Mastery" then
                                    Total := Int_Field (Get (Up, J), "TotalBoxes", 0);
                                 end if;
                              end loop;
                           end;
                        end if;
                     end;
                  end loop;
               end;
            end if;
         end;
         if Has_Field (Crew, "upgrades") then
            declare Up : constant JSON_Array := Get (Crew, "upgrades"); begin
               for I in 1 .. Length (Up) loop
                  if Str_Field (Get (Up, I), "name") = "Mastery" then
                     Marked := Int_Field (Get (Up, I), "boxesMarked", 0);
                  end if;
               end loop;
            end;
         end if;
      end;
   end Mastery_State;

   function Entity_Max_Rating (E : JSON_Value; Action : String) return Integer is
      --  maxRating as stored on the entity for this action; -1 when the
      --  entity has no such action (callers fall back to the settings).
      Attrs : constant JSON_Array := Get (Get (E, "talent"), "attributes");
   begin
      for I in 1 .. Length (Attrs) loop
         declare
            A    : constant JSON_Value := Get (Attrs, I);
            Acts : constant JSON_Array := Get (A, "actions");
         begin
            for J in 1 .. Length (Acts) loop
               declare X : constant JSON_Value := Get (Acts, J); begin
                  if Str_Field (X, "name") = Action then
                     return Int_Field (X, "maxRating", -1);
                  end if;
               end;
            end loop;
         end;
      end loop;
      return -1;
   end Entity_Max_Rating;

   function Has_Ability (E : JSON_Value; Name : String) return Boolean is
      P : constant JSON_Value := Get (E, "playbook");
      A : constant JSON_Array :=
        (if Has_Field (P, "abilities") then Get (P, "abilities")
         else Empty_Array);
   begin
      for I in 1 .. Length (A) loop
         if Str_Field (Get (A, I), "name") = Name then return True; end if;
      end loop;
      return False;
   end Has_Ability;

   function Committed_Bulk (E : JSON_Value) return Integer is
      G   : constant JSON_Value := Get (E, "gear");
      L   : constant JSON_Array := Get (G, "loadout");
      Sum : Integer := 0;
   begin
      for I in 1 .. Length (L) loop
         Sum := Sum + Int_Field (Get (L, I), "bulk", 0);
      end loop;
      return Sum;
   end Committed_Bulk;

   function Upgrade_Marked (E : JSON_Value; Name : String) return Integer is
      U : constant JSON_Array :=
        (if Has_Field (E, "upgrades") then Get (E, "upgrades") else Empty_Array);
   begin
      for I in 1 .. Length (U) loop
         if Str_Field (Get (U, I), "name") = Name then
            return Int_Field (Get (U, I), "boxesMarked", 0);
         end if;
      end loop;
      return 0;
   end Upgrade_Marked;

   function Ability_Taken (E : JSON_Value; Name : String) return Integer is
      A : constant JSON_Array :=
        (if Has_Field (E, "specialAbilities") then Get (E, "specialAbilities")
         else Empty_Array);
   begin
      for I in 1 .. Length (A) loop
         if Str_Field (Get (A, I), "name") = Name then
            return Int_Field (Get (A, I), "timesTaken", 0);
         end if;
      end loop;
      return 0;
   end Ability_Taken;

   function Character_Capabilities (E : JSON_Value) return JSON_Value is
      G       : constant JSON_Value := Game (Str_Field (E, "gameStem"));
      X       : JSON_Value := Create_Object;
      Out_A   : JSON_Array := Empty_Array;
      Total   : Integer := 0;
      Marked  : Integer := 0;
      Committed : Integer := 0;
      Mule_Raise : Integer := 0;
   begin
      --  An entity whose game settings cannot be resolved has no capability
      --  projection; the caller maps this to 422 INVALID_ENTITY.
      if G.Kind /= JSON_Object_Type then return JSON_Null; end if;
      Set_Field (X, "characterId", Str_Field (E, "id"));
      Mastery_State (E, Total, Marked);
      declare
         Base_Cap    : constant Integer := Int_Field (Get (G, "ActionCap"), "Base", 0);
         Mastery_Cap : constant Integer := Int_Field (Get (G, "ActionCap"), "Mastery", 0);
         Cap         : constant Integer :=
           (if Total > 0 and then Marked >= Total then Mastery_Cap else Base_Cap);
         Attrs       : constant JSON_Array := Get (G, "Attributes");
      begin
         for I in 1 .. Length (Attrs) loop
            declare A0 : constant JSON_Value := Get (Attrs, I); begin
               if Has_Field (A0, "Actions") then
                  declare
                     Acts : constant JSON_Array := Get (A0, "Actions");
                  begin
                     for J in 1 .. Length (Acts) loop
                        declare
                           Item      : JSON_Value := Create_Object;
                           Name      : constant String := Str_Field (Get (Acts, J), "Name");
                           Max_Rating : Integer := Entity_Max_Rating (E, Name);
                        begin
                           if Max_Rating < 0 then
                              Max_Rating := Int_Field (G, "ActionPointMaximum", 0);
                           end if;
                           Set_Field (Item, "action", Name);
                           Set_Field (Item, "maxRating", Max_Rating);
                           Set_Field (Item, "effectiveMax",
                                      Integer'Min (Max_Rating, Cap));
                           Set_Field (Item, "masteryTotalBoxes", Total);
                           Set_Field (Item, "masteryMarkedBoxes", Marked);
                           Append (Out_A, Item);
                        end;
                     end loop;
                  end;
               end if;
            end;
         end loop;
      end;
      Set_Field (X, "effectiveActionCaps", Out_A);
      declare
         H      : constant JSON_Value := Get (Get (E, "monitor"), "harm");
         HC     : constant JSON_Value := Get (G, "HarmCapacities");
         Levels : constant Level_Array :=
           (To_Unbounded_String ("lesser"), To_Unbounded_String ("moderate"),
            To_Unbounded_String ("severe"), To_Unbounded_String ("fatal"));
         Cap_Keys : constant Level_Array :=
           (To_Unbounded_String ("Lesser"), To_Unbounded_String ("Moderate"),
            To_Unbounded_String ("Severe"), To_Unbounded_String ("Fatal"));
         HA : JSON_Array := Empty_Array;
      begin
         for I in Levels'Range loop
            declare
               Item     : JSON_Value := Create_Object;
               Slot     : constant JSON_Array := Get (H, To_String (Levels (I)));
               Capacity : constant Integer := Int_Field (HC, To_String (Cap_Keys (I)), 0);
            begin
               Set_Field (Item, "level", To_String (Levels (I)));
               Set_Field (Item, "capacity", Capacity);
               Set_Field (Item, "remaining", Capacity - Integer (Length (Slot)));
               Append (HA, Item);
            end;
         end loop;
         Set_Field (X, "harmCapacities", HA);
      end;
      declare
         LM      : constant JSON_Value := Get (G, "LoadMaxima");
         CMB     : constant JSON_Value := Get (LM, "CommitmentMaxBulk");
         Options : constant Level_Array :=
           (To_Unbounded_String ("none"), To_Unbounded_String ("light"),
            To_Unbounded_String ("normal"), To_Unbounded_String ("heavy"),
            To_Unbounded_String ("encumbered"));
         Opt_Keys : constant Level_Array :=
           (To_Unbounded_String ("none"), To_Unbounded_String ("Light"),
            To_Unbounded_String ("Normal"), To_Unbounded_String ("Heavy"),
            To_Unbounded_String ("Encumbered"));
         LA : JSON_Array := Empty_Array;
      begin
         Committed := Committed_Bulk (E);
         --  Mule (Blades Cutter) raises Light/Normal/Heavy by 2; the frozen
         --  loadLimits schema folds the raise into remainingBulk.
         if Has_Ability (E, "Mule") then Mule_Raise := 2; end if;
         for I in Options'Range loop
            declare
               Item     : JSON_Value := Create_Object;
               Opt      : constant String := To_String (Options (I));
               Max_Bulk : constant Integer :=
                 (if Opt = "none" then Int_Field (LM, "MaxBulk", 0)
                  else Int_Field (CMB, To_String (Opt_Keys (I)), 0));
            begin
               Set_Field (Item, "commitment", Opt);
               Set_Field (Item, "maxBulk", Max_Bulk);
               Set_Field (Item, "remainingBulk",
                          Max_Bulk
                          + (if Opt = "none" or else Opt = "encumbered"
                             then 0 else Mule_Raise)
                          - Committed);
               Append (LA, Item);
            end;
         end loop;
         Set_Field (X, "loadLimits", LA);
      end;
      declare
         P  : constant JSON_Value := Get (E, "playbook");
         A  : constant JSON_Array :=
           (if Has_Field (P, "abilities") then Get (P, "abilities")
            else Empty_Array);
         AA : JSON_Array := Empty_Array;
      begin
         for I in 1 .. Length (A) loop
            declare
               Item      : JSON_Value := Create_Object;
               Name      : constant String := Str_Field (Get (A, I), "name");
               Taken     : constant Integer := Int_Field (Get (A, I), "timesTaken", 0);
               Max_Takes : Integer := Integer'Last;
            begin
               --  permissive fallback for unknown abilities mirrors the
               --  enforcement side (Can_Take_More)
               if Has_Field (G, "Playbooks") then
                  declare
                     PBs : constant JSON_Array := Get (G, "Playbooks");
                  begin
                     for J in 1 .. Length (PBs) loop
                        declare PB : constant JSON_Value := Get (PBs, J); begin
                           if Str_Field (PB, "Name") = Str_Field (P, "name")
                             and then Has_Field (PB, "SpecialAbilities")
                           then
                              declare
                                 SAs : constant JSON_Array := Get (PB, "SpecialAbilities");
                              begin
                                 for K in 1 .. Length (SAs) loop
                                    if Str_Field (Get (SAs, K), "Name") = Name then
                                       Max_Takes :=
                                         Int_Field (Get (SAs, K), "TimesTakeable",
                                                    Integer'Last);
                                    end if;
                                 end loop;
                              end;
                           end if;
                        end;
                     end loop;
                  end;
               end if;
               Set_Field (Item, "name", Name);
               Set_Field (Item, "timesTaken", Taken);
               Set_Field (Item, "maxTakes", Max_Takes);
               Set_Field (Item, "remaining", Max_Takes - Taken);
               Append (AA, Item);
            end;
         end loop;
         Set_Field (X, "availableAbilityTakes", AA);
      end;
      return X;
   end Character_Capabilities;

   function Crew_Capabilities (E : JSON_Value) return JSON_Value is
      G             : constant JSON_Value := Game (Str_Field (E, "gameStem") & "-crews");
      X             : JSON_Value := Create_Object;
      Type_Settings : JSON_Value := JSON_Null;
      UO            : JSON_Array := Empty_Array;
      AO            : JSON_Array := Empty_Array;
      Turf_Effective : Integer;
   begin
      Set_Field (X, "crewId", Str_Field (E, "id"));
      if G.Kind = JSON_Object_Type and then Has_Field (G, "CrewTypes") then
         declare
            Types : constant JSON_Array := Get (G, "CrewTypes");
         begin
            for I in 1 .. Length (Types) loop
               if Str_Field (Get (Types, I), "Name") = Str_Field (E, "crewTypeName") then
                  Type_Settings := Get (Types, I);
               end if;
            end loop;
         end;
      end if;
      if Type_Settings.Kind = JSON_Object_Type then
         if Has_Field (Type_Settings, "Upgrades") then
            declare
               Up : constant JSON_Array := Get (Type_Settings, "Upgrades");
            begin
               for I in 1 .. Length (Up) loop
                  declare
                     Item  : JSON_Value := Create_Object;
                     Name  : constant String := Str_Field (Get (Up, I), "Name");
                     Total : constant Integer := Int_Field (Get (Up, I), "TotalBoxes", 0);
                     Marked : constant Integer := Upgrade_Marked (E, Name);
                  begin
                     Set_Field (Item, "name", Name);
                     Set_Field (Item, "totalBoxes", Total);
                     Set_Field (Item, "marked", Marked);
                     Set_Field (Item, "remaining", Total - Marked);
                     Append (UO, Item);
                  end;
               end loop;
            end;
         end if;
         if Has_Field (Type_Settings, "SpecialAbilities") then
            declare
               SAs : constant JSON_Array := Get (Type_Settings, "SpecialAbilities");
            begin
               for I in 1 .. Length (SAs) loop
                  declare
                     Item      : JSON_Value := Create_Object;
                     Name      : constant String := Str_Field (Get (SAs, I), "Name");
                     Max_Takes : constant Integer := Int_Field (Get (SAs, I), "TimesTakeable", 0);
                     Taken     : constant Integer := Ability_Taken (E, Name);
                  begin
                     Set_Field (Item, "name", Name);
                     Set_Field (Item, "maxTakes", Max_Takes);
                     Set_Field (Item, "taken", Taken);
                     Set_Field (Item, "remaining", Max_Takes - Taken);
                     Append (AO, Item);
                  end;
               end loop;
            end;
         end if;
      end if;
      Set_Field (X, "upgrades", UO);
      Set_Field (X, "abilities", AO);
      Turf_Effective := Int_Field (E, "turf") + Turf_Effect_Delta (E);
      Set_Field (X, "effectiveTurf", Turf_Effective);
      Set_Field (X, "developThreshold",
                 Integer'Max (0, Int_Field (Get (E, "rep"), "max") - Turf_Effective));
      return X;
   end Crew_Capabilities;

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
            Validator_Gate.Check (Kind, E, Created_Ok);
            if not Created_Ok then
               return Fail (AWS.Messages.S500, Kind & ".create", "INTERNAL",
                            Message => "created entity fails schema validation");
            end if;
         end;
         Write_Entity (Kind, Str_Field (E, "id"), E);
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
         if Header (Request, "Idempotency-Key") /= "" then
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
            Ada.Directories.Delete_Tree (Entity_Dir (Kind, Id));
            Entity_Lock_Registry.Release (Id);
            --  SC-A4: a degraded entity has no readable DTO to embed in the
            --  success envelope; the delete result carries the ok/applied/
            --  sideEffects envelope only.
            return Json_Response
              (Success_Result ("delete",
                               (if Adm_Canonical then E else JSON_Null)));
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
                     if Ada.Directories.Simple_Name (Ent) /= "_index.json"
                       and then (Length (Best) = 0
                         or else Ada.Directories.Simple_Name (Ent) > To_String (Best))
                     then
                        Best := To_Unbounded_String (Ada.Directories.Simple_Name (Ent));
                     end if;
                  end loop;
                  Ada.Directories.End_Search (Search);
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
                     Preview_Token_Store.Issue
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
                     Preview_Token_Store.Redeem
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
                        K : Key_Buffer;
                        N : Natural;
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
                        Collect_Keys (B, K, N);
                        for J in 1 .. N loop
                           declare
                              Key_Name : constant String := To_String (K (J));
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
                  Preview_Token_Store.Issue
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
                  Preview_Token_Store.Redeem
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
            R := Mutate (Kind, Op, E, B);
            if Bool_Field (R, "ok") then
               --  SC-A1: every write persists the complete canonical shape —
               --  a mutation that would produce a non-canonical document is
               --  rejected before any snapshot or write.
               declare
                  Mutated_Ok : Boolean;
               begin
                  Validator_Gate.Check (Kind, E, Mutated_Ok);
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
         "XpTrackMaxima|FundMaxima|CrewTrackerMaxima|TurfMax|LoadMaxima|" &
         "ActionCap|SessionExpressionMax|DevelopCoinCostMultiplier|" &
         "ClockPurposes|StartingAbility|ExtraDescription|",
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
                        S_No_Extra (UP, "|Name|TotalBoxes|Description|", Where);
                        S_Require_Str (UP, "Name", Where);
                        if S_Int (UP, "TotalBoxes", Where) < 1 then
                           Settings_Error (Where, "TotalBoxes must be at least 1");
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
      if Game_Cache_Count >= Max_Cached_Games then
         Settings_Error (Stem & ".json", "too many games for the cache");
      end if;
      Game_Cache_Count := Game_Cache_Count + 1;
      Game_Cache (Game_Cache_Count) :=
        (To_Unbounded_String (Stem), V, JSON_Null);
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
            if Game_Cache_Count >= Max_Cached_Games then
               Settings_Error (Stem & "-crews.json", "too many games for the cache");
            end if;
            Game_Cache_Count := Game_Cache_Count + 1;
            Game_Cache (Game_Cache_Count) :=
              (To_Unbounded_String (Stem & "-crews"), CV, JSON_Null);
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
                                 Validator_Gate.Check (To_String (Ents (I).Kind), Ents (I).E,
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
                  Crash_Hook.Arm (Str_Field (B, "id"));
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
