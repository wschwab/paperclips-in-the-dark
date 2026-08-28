with Ada.Calendar;
with Ada.Calendar.Formatting;
with Ada.Directories;
with Ada.Strings.Fixed;
with Ada.Strings.Unbounded;
with Ada.Text_IO;
with AWS.Utils;
with GNAT.OS_Lib;
with GNAT.SHA256;
with GNATCOLL.JSON;
with Interfaces.C;
with Pitd_Error;

package body Pitd_Common is
   pragma SPARK_Mode (Off);

   use Ada.Strings.Unbounded;
   use GNATCOLL.JSON;
   use Pitd_Error;
   use type Ada.Calendar.Time;
   use type Ada.Directories.File_Kind;
   use type GNAT.OS_Lib.File_Descriptor;
   use type Interfaces.C.int;

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

   --  SC-A8 / FV-028: create takes exactly one baseline snapshot so a
   --  fresh entity's first undo is not NO_HISTORY.  The baseline is a
   --  history file but NOT a retained snapshot: it is excluded from the
   --  history listing, the sidecar index, and the undo newest-first search
   --  (undo falls back to it only when no real snapshot exists), so the
   --  derived historyCount/canUndo projections stay 0/false on a fresh
   --  entity (LIFECYCLE-DERIVED-001).  The 17-zero prefix sorts before
   --  every real snapshot id (Snapshot_Clock prefixes are epoch-millis).
   function Is_Baseline_Snapshot (Name : String) return Boolean is
     (Name = Baseline_Snapshot_Name);

   procedure Write_Baseline_Snapshot
     (Kind, Id, Op : String; Entity : JSON_Value) is
      H : JSON_Value := Create_Object;
      M : JSON_Value := Create_Object;
      Hist : constant String := Entity_Dir (Kind, Id) & "/history";
   begin
      Set_Field (M, "snapshotId", "00000000000000000-baseline");
      Set_Field (M, "takenAt", Now);
      Set_Field (M, "op", Op);
      Set_Field (H, "_snapshot", M);
      Set_Field (H, "entity", Clone (Entity));
      Atomic_Write (Hist & "/" & Baseline_Snapshot_Name, H);
   end Write_Baseline_Snapshot;

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
         if Ada.Directories.Simple_Name (Item) /= "_index.json"
           and then not Is_Baseline_Snapshot (Ada.Directories.Simple_Name (Item)) then
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
   --  OPT-007: summary projections (Character_Summary, Crew_Summary) only
   --  need the snapshot COUNT, not the full entries.  This reads the
   --  sidecar length or counts directory entries without parsing bodies.
   function History_Count (Kind, Id : String) return Natural is
      Base : constant String := Entity_Dir (Kind, Id) & "/history";
   begin
      if not Ada.Directories.Exists (Base) then return 0; end if;
      declare
         Sidecar : constant String := Base & "/_index.json";
      begin
         if Ada.Directories.Exists (Sidecar) then
            begin
               declare V : constant JSON_Value := Read (Read_File (Sidecar)); begin
                  if Has_Field (V, "entries") then
                     return GNATCOLL.JSON.Length (Get (V, "entries"));
                  end if;
               end;
            exception
               when others => null;  --  corrupt sidecar: fall through
            end;
         end if;
      end;
      --  Fallback: count *.json files excluding _index and baseline.
      declare
         Search : Ada.Directories.Search_Type;
         Item   : Ada.Directories.Directory_Entry_Type;
         Count  : Natural := 0;
      begin
         Ada.Directories.Start_Search
           (Search, Base, "*.json",
            (Ada.Directories.Ordinary_File => True, others => False));
         while Ada.Directories.More_Entries (Search) loop
            Ada.Directories.Get_Next_Entry (Search, Item);
            if Ada.Directories.Simple_Name (Item) /= "_index.json"
              and then not Is_Baseline_Snapshot (Ada.Directories.Simple_Name (Item))
            then
               Count := Count + 1;
            end if;
         end loop;
         Ada.Directories.End_Search (Search);
         return Count;
      end;
   end History_Count;

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
            if Ada.Directories.Simple_Name (Item) /= "_index.json"
           and then not Is_Baseline_Snapshot (Ada.Directories.Simple_Name (Item)) then
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

   function Empty_List return JSON_Value is (Create (Empty_Array));

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

   --  CONTRACT-04 (2026-08-25): crew stash capacity.  The base is the
   --  validated setting CrewStashBaseCapacity; an upgrade whose crew-type
   --  game-data entry declares StashCapacities (capacity indexed by boxes
   --  marked, last entry repeated) raises it to that table's value for its
   --  current marks.  Only the crew's own upgrade marks feed the
   --  derivation — never a literal.  Missing game data keeps the base
   --  (unknown stems keep the historical permissive fallback shape).
   function Crew_Stash_Capacity (E : JSON_Value) return Integer is
      Stem : constant String := Str_Field (E, "gameStem");
      S    : constant Settings_Ref := (To_Unbounded_String (Stem), Game (Stem));
      Cap  : Integer := Settings_Int (S, "CrewStashBaseCapacity", 0);
      G    : constant JSON_Value := Game (Stem & "-crews");
   begin
      if G.Kind = JSON_Object_Type and then Has_Field (G, "CrewTypes")
        and then Has_Field (E, "upgrades")
      then
         declare
            Ups : constant JSON_Array := Get (E, "upgrades");
         begin
            for I in 1 .. Length (Ups) loop
               declare
                  U      : constant JSON_Value := Get (Ups, I);
                  Marked : constant Integer := Int_Field (U, "boxesMarked", 0);
                  Name   : constant String := Str_Field (U, "name");
               begin
                  if Marked >= 1 and then Name'Length > 0 then
                     declare
                        Types : constant JSON_Array := Get (G, "CrewTypes");
                     begin
                        for J in 1 .. Length (Types) loop
                           declare
                              T : constant JSON_Value := Get (Types, J);
                           begin
                             if Has_Field (T, "Upgrades") then
                               declare
                                 GD : constant JSON_Array := Get (T, "Upgrades");
                               begin
                                 for K in 1 .. Length (GD) loop
                                   declare
                                     D : constant JSON_Value := Get (GD, K);
                                   begin
                                     if Str_Field (D, "Name") = Name
                                       and then Has_Field (D, "StashCapacities")
                                     then
                                       declare
                                         Steps : constant JSON_Array :=
                                           Get (D, "StashCapacities");
                                         --  GNAT arrays are 1-based: marked
                                         --  boxes m indexes element m+1,
                                         --  clamped to the last entry.
                                         Idx : constant Integer :=
                                           Integer'Min (Marked + 1,
                                                        Length (Steps));
                                         SV : constant JSON_Value :=
                                           Get (Steps, Idx);
                                       begin
                                         if SV.Kind = JSON_Int_Type
                                           and then Integer'(Get (SV)) > Cap
                                         then
                                           Cap := Integer'(Get (SV));
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
                  end if;
               end;
            end loop;
         end;
      end if;
      return Cap;
   end Crew_Stash_Capacity;

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

   --  SC-A5: Mastery upgrade state for a character's crew (TotalBoxes from
   --  the crew-type game data, boxes actually marked on the crew entity).
   --  Crewless characters report 0/0 (no Mastery derivation possible).
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

   --  A13c: Mastery-gated cap for action ratings (SC-A6: the 3/4 literals
   --  moved to the validated game settings ActionCap.Base/Mastery).  The
   --  cap is ActionCap.Mastery when the character's crew has the Mastery
   --  upgrade fully marked (boxesMarked >= TotalBoxes); otherwise
   --  ActionCap.Base.  TotalBoxes comes from the crew-type game data
   --  (Game(stem & "-crews") CrewTypes[].Upgrades[] where Name="Mastery").
   --  Characters with no crew (or an unreadable crew) cap at ActionCap.Base.
   --  The SAME derivation feeds the character capability projection
   --  (effectiveActionCap), so action.set-rating and attribute.levelup
   --  enforce exactly the published cap.
   function Rating_Cap (E : JSON_Value) return Integer is
      G     : constant JSON_Value := Game (Str_Field (E, "gameStem"));
      Total : Integer;
      Marked : Integer;
   begin
      Mastery_State (E, Total, Marked);
      if G.Kind /= JSON_Object_Type or else not Has_Field (G, "ActionCap") then
         return 0;
      end if;
      return (if Total > 0 and then Marked >= Total
              then Int_Field (Get (G, "ActionCap"), "Mastery", 0)
              else Int_Field (Get (G, "ActionCap"), "Base", 0));
   end Rating_Cap;

   function Content_Token (Bytes : String) return String is
     ("sha256:" & GNAT.SHA256.Digest (Bytes));

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

   --  Thin wrappers so callers need no visibility of the protected object.
   procedure Crash_Arm (Entity_Id : String) is
   begin
      Crash_Hook.Arm (Entity_Id);
   end Crash_Arm;

   procedure Crash_Check (Target : String; Crash : out Boolean) is
   begin
      Crash_Hook.Check (Target, Crash);
   end Crash_Check;

   function Cache_Game (Stem : String; Settings : JSON_Value) return Boolean is
   begin
      if Game_Cache_Count >= Max_Cached_Games then
         return False;
      end if;
      Game_Cache_Count := Game_Cache_Count + 1;
      Game_Cache (Game_Cache_Count) :=
        (To_Unbounded_String (Stem), Settings, JSON_Null);
      return True;
   end Cache_Game;

end Pitd_Common;
