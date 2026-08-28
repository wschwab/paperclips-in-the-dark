with Ada.Directories;
with Ada.Strings.UTF_Encoding.Wide_Wide_Strings;
with GNATCOLL.JSON;
with Pitd_Common;
with Pitd_Stored;

package body Pitd_Summary is
   pragma SPARK_Mode (Off);

   use GNATCOLL.JSON;
   use Pitd_Common;
   use Pitd_Stored;

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
      --  SC-A8: derived canUndo/historyCount projections (lifecycle-matrix
      --  § 9) — computed at response time from the retained snapshot count,
      --  never stored.  The create baseline is excluded from the count.
      declare
         Hc : constant Natural :=
           History_Count ("character", Str_Field (C, "id"));
      begin
         Set_Field (X, "canUndo", Hc > 0);
         Set_Field (X, "historyCount", Integer (Hc));
      end;
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
      --  BUG-013: derived canUndo/historyCount projections (lifecycle-matrix
      --  § 9) — computed at response time from the retained snapshot count,
      --  never stored.  Mirrors Character_Summary.  The create baseline is
      --  excluded from the count.
      declare
         Hc : constant Natural :=
           History_Count ("crew", Str_Field (C, "id"));
      begin
         Set_Field (X, "canUndo", Hc > 0);
         Set_Field (X, "historyCount", Integer (Hc));
      end;
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
         Set_Field (X, "canUndo", False);
         Set_Field (X, "historyCount", Integer'(0));
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
         Set_Field (X, "canUndo", False);
         Set_Field (X, "historyCount", Integer'(0));
      end if;
      Set_Field (X, "revision", Integer'(1));
      Set_Field (X, "isReadable", False);
      Set_Field (X, "isRepairable", Repairable);
      Set_Field (X, "isComplete", False);
      Set_Field (X, "deleteToken", Content_Token (Bytes));
      return X;
   end Degraded_Row;


   function Non_Blank_String (S : String) return Boolean is
      use Ada.Strings.UTF_Encoding.Wide_Wide_Strings;
      W : constant Wide_Wide_String := Decode (S);
      --  ECMAScript TrimString whitespace set (matches the frontend
      --  generated evaluator's trim()): TAB..CR, SPACE, NBSP, OGHAM,
      --  EN..EM QUAD, LS, PS, NARROW NBSP, MATH SPACE, IDEOGRAPHIC SPACE,
      --  ZWNBSP.  Anything else makes the string non-blank.
      function Is_Whitespace (C : Wide_Wide_Character) return Boolean is
        (C = ' '
         or else (C >= Wide_Wide_Character'Val (16#0009#)
                  and C <= Wide_Wide_Character'Val (16#000D#))
         or else C = Wide_Wide_Character'Val (16#00A0#)
         or else C = Wide_Wide_Character'Val (16#1680#)
         or else (C >= Wide_Wide_Character'Val (16#2000#)
                  and C <= Wide_Wide_Character'Val (16#200A#))
         or else C = Wide_Wide_Character'Val (16#2028#)
         or else C = Wide_Wide_Character'Val (16#2029#)
         or else C = Wide_Wide_Character'Val (16#202F#)
         or else C = Wide_Wide_Character'Val (16#205F#)
         or else C = Wide_Wide_Character'Val (16#3000#)
         or else C = Wide_Wide_Character'Val (16#FEFF#));
   begin
      for I in W'Range loop
         if not Is_Whitespace (W (I)) then
            return True;
         end if;
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
   --  frozen clockSummary (campaign.json#/$defs/clockSummary), so an
   --  unreadable clock is listed in the canonical-empty summary shape:
   --  route-derived identity, zeroed fields, the neutral behavior/ownership
   --  defaults, isReadable:false, isRepairable (true for parseable-
   --  repairable / needs-input outcomes, false for unreadable bytes),
   --  isComplete:false, and deleteToken = sha256:<lowercase hex> of the
   --  CURRENT raw bytes (the degraded row's If-Match value).  The raw bytes
   --  are never parsed into the row.  Read-only: never writes.
   function Degraded_Clock_Row
     (Id, Bytes : String; Repairable : Boolean) return JSON_Value
   is
      X : JSON_Value := Create_Object;
   begin
      Set_Field (X, "kind", "clock");
      Set_Field (X, "id", Id);
      Set_Field (X, "name", "");
      Set_Field (X, "ownerKind", "campaign");
      Set_Field (X, "ownerId", "");
      Set_Field (X, "purpose", "custom");
      Set_Field (X, "behavior", "bounded");
      Set_Field (X, "segments", Integer'(0));
      Set_Field (X, "size", Integer'(1));
      Set_Field (X, "rollover", Integer'(0));
      Set_Field (X, "relatedClockIds", Empty_Array);
      Set_Field (X, "isReadable", False);
      Set_Field (X, "isRepairable", Repairable);
      Set_Field (X, "isComplete", False);
      Set_Field (X, "deleteToken", Content_Token (Bytes));
      return X;
   end Degraded_Clock_Row;

   --  SC-A4: one canonical clock summary row.  The clock list schema is
   --  the frozen clockSummary (campaign.json#/$defs/clockSummary) — the
   --  stored DTO's clock fields only, never revision/formatVersion/
   --  timestamps.  Read-only: never writes.
   function Clock_Summary (C : JSON_Value) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      Set_Field (X, "id", Str_Field (C, "id"));
      Set_Field (X, "name", Str_Field (C, "name"));
      Set_Field (X, "ownerKind", Str_Field (C, "ownerKind"));
      Set_Field (X, "ownerId", Str_Field (C, "ownerId"));
      Set_Field (X, "purpose", Str_Field (C, "purpose"));
      Set_Field (X, "behavior", Str_Field (C, "behavior"));
      Set_Field (X, "segments", Int_Field (C, "segments"));
      Set_Field (X, "size", Int_Field (C, "size"));
      Set_Field (X, "rollover", Int_Field (C, "rollover"));
      declare
         R : constant JSON_Array := Get (C, "relatedClockIds");
      begin
         Set_Field (X, "relatedClockIds", R);
      end;
      return X;
   end Clock_Summary;

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
      --  OPT-006: build a crewId -> memberCount map in ONE pass through
      --  the character array, replacing the O(crews x characters) inner
      --  loop with O(characters + crews).
      Crew_Counts : JSON_Value := Create_Object;
   begin
      for J in 1 .. Length (CC) loop
         declare
            Cid : constant String :=
              Str_Field (Get (CC, J), "crewId");
         begin
            if Cid'Length > 0 then
               Set_Field (Crew_Counts, Cid,
                Int_Field (Crew_Counts, Cid, 0) + 1);
            end if;
         end;
      end loop;
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
                  Members : constant Natural :=
                    Int_Field (Crew_Counts, Rid, 0);
               begin
                  Classify_Stored ("crew", Rid, Bytes, E, Ctx, Iss, Can);
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

   --  SC-A4: the ONE clock-row projection (list endpoint).  Every route is
   --  listed (Q15): canonical rows carry the frozen clockSummary fields
   --  (clock fields + isReadable/isRepairable/isComplete true and the
   --  canonical empty deleteToken); degraded rows keep the same schema via
   --  Degraded_Clock_Row.  One unreadable clock never removes valid rows
   --  and never changes the 200 status.  Read-only: never writes.
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
                  X      : JSON_Value;
               begin
                  Classify_Stored ("clock", Rid, Bytes, E, Ctx, Iss, Can);
                  if Can then
                     X := Clock_Summary (E);
                     Set_Field (X, "kind", "clock");
                     Set_Field (X, "isReadable", True);
                     Set_Field (X, "isRepairable", True);
                     Set_Field (X, "isComplete", True);
                     Set_Field (X, "deleteToken", "");
                  else
                     X := Degraded_Clock_Row
                       (Rid, Bytes,
                        Str_Field (Ctx, "outcome") /= "unreadable");
                  end if;
                  Append (O, X);
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

end Pitd_Summary;
