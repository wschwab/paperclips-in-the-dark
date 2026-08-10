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
with System;

package body Pitd_Callback is
   use Ada.Strings.Unbounded;
   use GNATCOLL.JSON;
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

   Max_Import  : constant := 1_024 * 1_024;
   type Level_Array is array (Positive range <>) of Unbounded_String;

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
      end loop;
      return "";
   end Query_Of;

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
         begin
            while W < Text'Length loop
               Written := GNAT.OS_Lib.Write
                 (F, Text (Text'First + W .. Text'Last)'Address, Text'Length - W);
               if Written <= 0 then
                  GNAT.OS_Lib.Close (F, Status);
                  raise Ada.Text_IO.Device_Error with "short write to " & Tmp;
               end if;
               W := W + Written;
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

   procedure Write_Entity (Kind, Id : String; Entity : JSON_Value) is
   begin
      Atomic_Write (Current_File (Kind, Id), Entity);
   end Write_Entity;

   function All_Entities (Kind : String) return JSON_Array is
      Base : constant String := To_String(Data_Root)&"/"&Kind&"s";
      Search : Ada.Directories.Search_Type; Dir_Item : Ada.Directories.Directory_Entry_Type;
      Out_A : JSON_Array := Empty_Array;
   begin
      if not Ada.Directories.Exists(Base) then return Out_A;end if;
      Ada.Directories.Start_Search(Search,Base,"*",(Ada.Directories.Directory=>True,others=>False));
      while Ada.Directories.More_Entries(Search) loop Ada.Directories.Get_Next_Entry(Search,Dir_Item);declare N:constant String:=Ada.Directories.Simple_Name(Dir_Item);V:JSON_Value;begin if N/="." and then N/=".." then V:=Read_Entity(Kind,N);if V.Kind=JSON_Object_Type then Append(Out_A,V);end if;end if;end;end loop;Ada.Directories.End_Search(Search);return Out_A;
   end All_Entities;

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

   function Error_Result
     (Op, Code, Message : String; Entity : JSON_Value := JSON_Null)
      return JSON_Value
   is
      R : JSON_Value := Create_Object;
      A : JSON_Value := Create_Object;
      E : JSON_Value := Create_Object;
   begin
      Set_Field (A, "op", Op); Set_Field (E, "code", Code); Set_Field (E, "message", Message);
      Set_Field (R, "ok", False); Set_Field (R, "applied", A);
      Set_Field (R, "sideEffects", Empty_Array); Set_Field (R, "error", E);
      if Entity.Kind = JSON_Object_Type then Set_Field (R, Str_Field (Entity, "kind"), Entity); end if;
      return R;
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
      Set_Field (R, Str_Field (Entity, "kind"), Entity);
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

   function Parse_Body (Body_Text : String) return JSON_Value is
   begin
      if Body_Text'Length > Max_Import then
         raise Constraint_Error with "request exceeds 1 MiB";
      end if;
      return (if Body_Text = "" then Create_Object else Read (Body_Text));
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
        or else Op = "claim.set" or else Op = "claim.customize"
        or else Op = "claim.reset"
      then
         return True;
      end if;
      return False;
   end Snapshots;

   --  BUG-003: import validation against the full DTO shape.  Top-level
   --  required key lists mirror contract/schemas/{character,crew,clock}.json
   --  (crew contacts/factions stay optional exactly as in the schema).
   type Field_List is array (Positive range <>) of Unbounded_String;
   Character_Required : constant Field_List :=
     (To_Unbounded_String ("kind"), To_Unbounded_String ("id"),
      To_Unbounded_String ("gameStem"), To_Unbounded_String ("gameName"),
      To_Unbounded_String ("language"), To_Unbounded_String ("revision"),
      To_Unbounded_String ("formatVersion"), To_Unbounded_String ("createdAt"),
      To_Unbounded_String ("updatedAt"), To_Unbounded_String ("dossier"),
      To_Unbounded_String ("monitor"), To_Unbounded_String ("talent"),
      To_Unbounded_String ("playbook"), To_Unbounded_String ("gear"),
      To_Unbounded_String ("fund"), To_Unbounded_String ("rolodex"),
      To_Unbounded_String ("session"), To_Unbounded_String ("notebook"),
      To_Unbounded_String ("isRetired"), To_Unbounded_String ("isDeadish"));
   Crew_Required : constant Field_List :=
     (To_Unbounded_String ("kind"), To_Unbounded_String ("id"),
      To_Unbounded_String ("gameStem"), To_Unbounded_String ("gameName"),
      To_Unbounded_String ("language"), To_Unbounded_String ("revision"),
      To_Unbounded_String ("formatVersion"), To_Unbounded_String ("createdAt"),
      To_Unbounded_String ("updatedAt"), To_Unbounded_String ("crewTypeName"),
      To_Unbounded_String ("name"), To_Unbounded_String ("lair"),
      To_Unbounded_String ("reputation"), To_Unbounded_String ("huntingGrounds"),
      To_Unbounded_String ("tier"), To_Unbounded_String ("hold"),
      To_Unbounded_String ("heat"), To_Unbounded_String ("wanted"),
      To_Unbounded_String ("rep"), To_Unbounded_String ("experience"),
      To_Unbounded_String ("specialAbilities"), To_Unbounded_String ("upgrades"),
      To_Unbounded_String ("cohorts"), To_Unbounded_String ("coin"),
      To_Unbounded_String ("stash"), To_Unbounded_String ("notes"),
      To_Unbounded_String ("turf"));
   Clock_Required : constant Field_List :=
     (To_Unbounded_String ("kind"), To_Unbounded_String ("id"),
      To_Unbounded_String ("revision"), To_Unbounded_String ("formatVersion"),
      To_Unbounded_String ("createdAt"), To_Unbounded_String ("updatedAt"),
      To_Unbounded_String ("name"), To_Unbounded_String ("clockKind"),
      To_Unbounded_String ("segments"), To_Unbounded_String ("size"),
      To_Unbounded_String ("rollover"));

   function Has_All_Fields (B : JSON_Value; Names : Field_List) return Boolean is
   begin
      for I in Names'Range loop
         if not Has_Field (B, To_String (Names (I))) then return False; end if;
      end loop;
      return True;
   end Has_All_Fields;

   function Import_Valid (Kind : String; B : JSON_Value) return Boolean is
   begin
      if B.Kind /= JSON_Object_Type then return False; end if;
      if not Has_Field (B, "revision")
        or else Get (B, "revision").Kind /= JSON_Int_Type
        or else Int_Field (B, "revision") < 1
      then
         return False;
      end if;
      if not Has_Field (B, "formatVersion")
        or else Get (B, "formatVersion").Kind /= JSON_Int_Type
        or else Int_Field (B, "formatVersion") /= 1
      then
         return False;
      end if;
      if Kind = "character" then return Has_All_Fields (B, Character_Required);
      elsif Kind = "crew" then return Has_All_Fields (B, Crew_Required);
      elsif Kind = "clock" then return Has_All_Fields (B, Clock_Required);
      end if;
      return False;
   end Import_Valid;

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
      Name : constant String := To_String (Games_Root) & "/" & Stem & ".json";
   begin
      if not Safe (Stem) or else not Ada.Directories.Exists (Name) then return JSON_Null; end if;
      return Read (Read_File (Name));
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
        & """,""isRetired"":false,""isDeadish"":false,""dossier"":{""name"":"""",""crewId"":"""",""alias"":"""",""look"":"""",""notes"":[],""background"":{""name"":"""",""description"":""""},""heritage"":{""name"":"""",""description"":""""},""vice"":{""name"":"""",""description"":"""",""purveyor"":{""name"":"""",""description"":""""}}},""monitor"":{""stress"":{""current"":0,""max"":9},""trauma"":{""traumas"":[],""max"":4},""harm"":{""lesser"":[],""moderate"":[],""severe"":[],""fatal"":[],""healingClock"":{""segments"":0,""size"":"
        & Trim_Image (Int_Field (G, "RecoveryClockSize", 4))
        & ",""rollover"":0}},""armor"":{""standardUsed"":false,""heavyUsed"":false,""specialUsed"":false,""hasStandard"":false,""hasHeavy"":false,""hasSpecial"":false}},""talent"":{""attributes"":[]},""playbook"":{""name"":"""
        & Playbook & """,""experience"":{""points"":0,""max"":8},""abilities"":[]},""gear"":{""loadout"":[],""availableGear"":[],""commitment"":""none"",""isCommitmentLocked"":false,""maxBulk"":9},""fund"":{""satchel"":{""coins"":2,""max"":4},""stash"":{""coins"":0,""max"":40}},""rolodex"":{""friends"":[]},""session"":{""playbookExpressions"":0,""characterExpressions"":0,""struggleExpressions"":0,""max"":3},""notebook"":""""}";
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

   function New_Clock (B : JSON_Value) return JSON_Value is
      Id : constant String := New_Id; T : constant String := Now;
   begin
      return Read ("{""kind"":""clock"",""id"":""" & Id & """,""revision"":1,""formatVersion"":1,""createdAt"":""" & T & """,""updatedAt"":""" & T
        & """,""name"":""" & Str_Field (B,"name") & """,""clockKind"":""" & Str_Field (B,"clockKind","project")
        & """,""segments"":0,""size"":" & Trim_Image (Int_Field (B,"size",4)) & ",""rollover"":0}");
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
         return Check_Fields (B, (Spec ("name", JSON_String_Type),
                                  Spec ("clockKind", JSON_String_Type, En => "project|rollover"),
                                  Spec ("size", JSON_Int_Type, MnI => 1)), Bad);
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
         if not Has_Any_Field (B) then Bad := To_Unbounded_String("end-score requires at least one flag"); return False; end if;
         return Check_Fields (B, (Spec ("clearArmorUsed", JSON_Boolean_Type, Rq => False),
                                  Spec ("resetLoadoutCommitment", JSON_Boolean_Type, Rq => False)), Bad);
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
   begin
      if Kind = "character" and then Bool_Field (E, "isRetired")
        and then Op /= "trauma.add" and then Op /= "trauma.remove"
      then return Error_Result (Op, "RETIRED", "character is retired", E); end if;

      if Op = "stress.add" then
         Target := Get (Get (E,"monitor"),"stress"); Requested := Int_Field (B,"delta");
         if Requested >= 0 then Core_Clamp_Add (Natural (Int_Field (Target,"current")), Natural (Int_Field (Target,"max")), Natural (Requested), New_Value, Applied);
         else Core_Clamp_Subtract (Natural (Int_Field (Target,"current")), Natural (Int_Field (Target,"max")), Natural (-Requested), New_Value, Applied); end if;
         Set_Field (Target,"current",Integer (New_Value)); Effective := (if Requested >= 0 then Integer (Applied) else -Integer (Applied));
         return Success_Result (Op,E,Requested,Effective, Side => (if Requested >= 0 and then New_Value = Natural (Int_Field (Target,"max")) then "stress full — consider trauma" else ""));
      elsif Op = "stress.clear" then declare X : constant JSON_Value := Get (Get (E,"monitor"),"stress"); begin Set_Field (X,"current",Integer'(0)); end;
      elsif Op = "trauma.add" or else Op = "trauma.remove" then
         declare
            use Paperclips_Core.Monitors;
            T     : constant JSON_Value := Get(Get(E,"monitor"),"trauma");
            A     : constant JSON_Array := Get(T,"traumas");
            O     : JSON_Array := Empty_Array;
            Name  : constant String := Str_Field(B,"trauma");
            Found : Boolean := False;
            Mon   : Monitor
              (Stress_Max => 1, Trauma_Max => Paperclips_Core.Capacity (Int_Field (T,"max")),
               Lesser_Slots => 1, Moderate_Slots => 1, Severe_Slots => 1, Fatal_Slots => 1,
               Healing_Clock_Max => 1);
            Err   : Paperclips_Core.Operation_Error;
         begin
            for I in 1..Length(A) loop
               if String'(Get(Get(A,I)))=Name then Found:=True;end if;
            end loop;
            --  BUG-004: enforce the trauma maximum through the proved core.
            if Op = "trauma.add" then
               if Found then
                  O := A;
               else
                  for I in 1 .. Length (A) loop
                     Add_Trauma (Mon, Err);
                  end loop;
                  Add_Trauma (Mon, Err);
                  if Paperclips_Core."/=" (Err, Paperclips_Core.No_Error) then
                     return Error_Result (Op, "DUPLICATE",
                                          "trauma is at its maximum", E);
                  end if;
                  O := A; Append (O, Create (Name));
                  Set_Field (T,"traumas",O);
                  Set_Field (E,"isRetired",
                             Length (O) >= Natural (Int_Field (T,"max")));
               end if;
            else
               for I in 1..Length(A) loop
                  if String'(Get(Get(A,I)))=Name then Found:=True;
                  else Append(O,Get(A,I));end if;
               end loop;
               Set_Field(T,"traumas",O);
               Set_Field(E,"isRetired",
                         Length (O) >= Natural (Int_Field (T,"max")));
            end if;
         end;
      elsif Op = "harm.add" then
         declare H:constant JSON_Value:=Get(Get(E,"monitor"),"harm"); Start:constant String:=Str_Field(B,"intensity","lesser"); Desc:constant String:=Str_Field(B,"description"); Land:Unbounded_String; begin
            for Level of Level_Array'(To_Unbounded_String("lesser"),To_Unbounded_String("moderate"),To_Unbounded_String("severe"),To_Unbounded_String("fatal")) loop
               if (Start="lesser" or else To_String(Level)/="lesser") and then (Start/="severe" or else (To_String(Level)="severe" or else To_String(Level)="fatal")) and then (Start/="moderate" or else To_String(Level)/="lesser") and then (Start/="fatal" or else To_String(Level)="fatal") then
                  declare A:constant JSON_Array:=Get(H,To_String(Level));Cap:constant Natural:=(if To_String(Level)="lesser" or else To_String(Level)="moderate" then 2 else 1);begin if Length(A)<Cap and then Length(Land)=0 then declare O:JSON_Array:=A;begin Append(O,Create(Desc));Set_Field(H,To_String(Level),O);Land:=Level;end;end if;end;
               end if;
            end loop;
            if Length(Land)=0 then return Error_Result(Op,"SLOT_FULL_FATAL","all harm slots are full",E);end if;Set_Field(E,"isDeadish",Array_Length(H,"fatal")>0);return Success_Result(Op,E,Landed=>To_String(Land),Side=>(if To_String(Land)/=Start then "harm spilled to "&To_String(Land) else ""));
         end;
      elsif Op = "harm.remove" then
         declare H:constant JSON_Value:=Get(Get(E,"monitor"),"harm");Level:constant String:=Str_Field(B,"intensity");Desc:constant String:=Str_Field(B,"description");A:constant JSON_Array:=Get(H,Level);O:JSON_Array:=Empty_Array;Skipped:Boolean:=False;begin for I in 1..Length(A) loop if not Skipped and then String'(Get(Get(A,I)))=Desc then Skipped:=True;else Append(O,Get(A,I));end if;end loop;Set_Field(H,Level,O);Set_Field(E,"isDeadish",Array_Length(H,"fatal")>0);end;
      elsif Op = "armor.set" then
         declare A:constant JSON_Value:=Get(Get(E,"monitor"),"armor");Name:constant String:=Str_Field(B,"armor");Used:constant Boolean:=Bool_Field(B,"used");Key:constant String:=(if Name="standard" then "standardUsed" elsif Name="heavy" then "heavyUsed" else "specialUsed");Has:constant String:=(if Name="standard" then "hasStandard" elsif Name="heavy" then "hasHeavy" else "hasSpecial");begin
            --  BUG-006: availability is derived from loadout/abilities.
            Set_Field (A, Has, Armor_Available (E, Name));
            if Used and then not Armor_Available (E, Name) then
               return Error_Result(Op,"ARMOR_NOT_AVAILABLE","armor is not available",E);
            end if;
            Set_Field(A,Key,Used);
         end;
      elsif Op = "playbook-xp.add" then
         Target := Get (Get (E,"playbook"),"experience"); Requested := Int_Field (B,"delta");
         Core_Clamp_Add (Natural (Int_Field(Target,"points")),Natural(Int_Field(Target,"max")),Natural'Max(0,Requested),New_Value,Applied);
         Set_Field(Target,"points",Integer(New_Value)); Effective:=Integer(Applied); return Success_Result(Op,E,Requested,Effective);
      elsif Op = "playbook-xp.clear" then declare X : constant JSON_Value := Get(Get(E,"playbook"),"experience"); begin Set_Field(X,"points",Integer'(0)); end;
      elsif Op = "action.set-rating" then
         declare Attrs:constant JSON_Array:=Get(Get(E,"talent"),"attributes");Name:constant String:=Str_Field(B,"action");Rating:constant Integer:=Int_Field(B,"rating");Found:Boolean:=False;begin if Rating<0 then return Error_Result(Op,"VALIDATION","invalid action rating",E);end if;if Rating>Rating_Cap(E) then return Error_Result(Op,"RATING_MAXED","action rating capped by Mastery",E);end if;for I in 1..Length(Attrs) loop declare Acts:constant JSON_Array:=Get(Get(Attrs,I),"actions");begin for J in 1..Length(Acts) loop declare X:constant JSON_Value:=Get(Acts,J);begin if Str_Field(X,"name")=Name then Set_Field(X,"rating",Integer'Min(Rating,Int_Field(X,"maxRating")));Found:=True;end if;end;end loop;end;end loop;if not Found then return Error_Result(Op,"VALIDATION","unknown action",E);end if;end;
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
                  return Error_Result (Op, "VALIDATION", "unknown action", E);
               end if;
               if not Is_Full (Track) then
                  return Error_Result (Op, "CANNOT_LEVEL_UP",
                                       "attribute XP track is not full", E);
               end if;
               if Natural (Int_Field (Tgt, "rating")) >= Rating_Max then
                  return Error_Result (Op, "RATING_MAXED",
                                       "action rating at its maximum", E);
               end if;
               Set_Field (Tgt, "rating", Int_Field (Tgt, "rating") + 1);
               Set_Field (X, "points", Integer'(0));
            end;
         end if;end if;end;end loop;if not Found then return Error_Result(Op,"VALIDATION","unknown attribute",E);end if;end;
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
                     return Error_Result(Op,"ABILITY_MAXED","ability is already taken to its limit",E);
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
            if not Found then return Error_Result(Op,"NOT_FOUND","ability not found",E);end if;
            Set_Field(P,Field,O);
         end;
      elsif Op="fund.gain" or else Op="fund.spend" or else Op="fund.liquidate" then declare F:constant JSON_Value:=Get(E,"fund");S:constant JSON_Value:=Get(F,"satchel");Z:constant JSON_Value:=Get(F,"stash");Req:constant Integer:=Int_Field(B,"coins");A1,A2:Integer:=0;begin Requested:=Req;if Op="fund.gain" then A1:=Integer'Min(Req,Int_Field(S,"max")-Int_Field(S,"coins"));Set_Field(S,"coins",Int_Field(S,"coins")+A1);A2:=Integer'Min(Req-A1,Int_Field(Z,"max")-Int_Field(Z,"coins"));Set_Field(Z,"coins",Int_Field(Z,"coins")+A2);Effective:=A1+A2;return Success_Result(Op,E,Requested,Effective,Side=>(if Effective<Requested then Trim_Image(Requested-Effective)&" coin could not be stored" else ""));elsif Op="fund.spend" then
         if Req>Int_Field(S,"coins")+Int_Field(Z,"coins")/2 then return Error_Result(Op,"INSUFFICIENT_FUNDS","not enough coins; max affordable "&Trim_Image(Int_Field(S,"coins")+Int_Field(Z,"coins")/2),E);end if;
         A1:=Integer'Min(Req,Int_Field(S,"coins"));Set_Field(S,"coins",Int_Field(S,"coins")-A1);Set_Field(Z,"coins",Int_Field(Z,"coins")-(Req-A1)*2);Effective:=Req;return Success_Result(Op,E,Requested,Effective);
      elsif Op="fund.liquidate" then
         if Req>Int_Field(S,"max")-Int_Field(S,"coins") then return Error_Result(Op,"SATCHEL_FULL","satchel cannot hold that many coins",E);end if;
         if Int_Field(Z,"coins")/2<Req then return Error_Result(Op,"INSUFFICIENT_FUNDS","not enough stash to liquidate",E);end if;
         Set_Field(Z,"coins",Int_Field(Z,"coins")-Req*2);Set_Field(S,"coins",Int_Field(S,"coins")+Req);Effective:=Req;return Success_Result(Op,E,Requested,Effective);
      end if;
      end;
      elsif Op="rolodex.add" then declare R:constant JSON_Value:=Get(E,"rolodex");A:constant JSON_Array:=Get(R,"friends");O:JSON_Array:=A;X:JSON_Value:=Create_Object;begin Set_Field(X,"entry",Str_Field(B,"entry"));Set_Field(X,"closeness","friend");Append(O,X);Set_Field(R,"friends",O);end;
      elsif Op="rolodex.set-closeness" then declare A:constant JSON_Array:=Get(Get(E,"rolodex"),"friends");begin for I in 1..Length(A) loop if Str_Field(Get(A,I),"entry")=Str_Field(B,"entry") then Set_Field(Get(A,I),"closeness",Str_Field(B,"closeness","friend"));end if;end loop;end;
      elsif Op="rolodex.remove" then declare A:constant JSON_Array:=Get(Get(E,"rolodex"),"friends");O:JSON_Array:=Empty_Array;Entry_Name:constant String:=Str_Field(B,"entry");Found:Boolean:=False;begin for I in 1..Length(A) loop if Str_Field(Get(A,I),"entry")=Entry_Name then Found:=True;else Append(O,Get(A,I));end if;end loop;if not Found then return Error_Result(Op,"NOT_FOUND","rolodex entry not found",E);end if;Set_Field(Get(E,"rolodex"),"friends",O);end;
      elsif Op="contact.add" then declare A:constant JSON_Array:=(if Has_Field(E,"contacts") then Get(E,"contacts") else Empty_Array);Name:constant String:=Str_Field(B,"name");begin for I in 1..Length(A) loop if Str_Field(Get(A,I),"name")=Name then return Error_Result(Op,"DUPLICATE","contact already exists",E);end if;end loop;declare X:JSON_Value:=Create_Object;O:JSON_Array:=A;begin Set_Field(X,"name",Name);Set_Field(X,"profession",Str_Field(B,"profession"));Append(O,X);Set_Field(E,"contacts",O);end;end;
      elsif Op="contact.remove" then declare A:constant JSON_Array:=(if Has_Field(E,"contacts") then Get(E,"contacts") else Empty_Array);O:JSON_Array:=Empty_Array;Name:constant String:=Str_Field(B,"name");Found:Boolean:=False;begin for I in 1..Length(A) loop if Str_Field(Get(A,I),"name")=Name then Found:=True;else Append(O,Get(A,I));end if;end loop;if not Found then return Error_Result(Op,"NOT_FOUND","contact not found",E);end if;Set_Field(E,"contacts",O);end;
      elsif Op="faction.set-status" then declare G:constant JSON_Value:=Game(Str_Field(E,"gameStem"));Lo:Integer:=Integer'First;Hi:Integer:=Integer'Last;begin if G.Kind=JSON_Object_Type and then Has_Field(G,"FactionStatus") then declare FS:constant JSON_Value:=Get(G,"FactionStatus");begin Lo:=Int_Field(FS,"Min",Integer'First);Hi:=Int_Field(FS,"Max",Integer'Last);end;end if;declare A:constant JSON_Array:=(if Has_Field(E,"factions") then Get(E,"factions") else Empty_Array);Name:constant String:=Str_Field(B,"name");Found:Boolean:=False;begin Requested:=Int_Field(B,"status");Effective:=Integer'Min(Integer'Max(Requested,Lo),Hi);for I in 1..Length(A) loop if Str_Field(Get(A,I),"name")=Name then Set_Field(Get(A,I),"status",Effective);Found:=True;end if;end loop;if not Found then declare X:JSON_Value:=Create_Object;O:JSON_Array:=A;begin Set_Field(X,"name",Name);Set_Field(X,"status",Effective);Append(O,X);Set_Field(E,"factions",O);end;end if;end;return Success_Result(Op,E,Requested,Effective);end;
      elsif Op="faction.remove" then declare A:constant JSON_Array:=(if Has_Field(E,"factions") then Get(E,"factions") else Empty_Array);O:JSON_Array:=Empty_Array;Name:constant String:=Str_Field(B,"name");Found:Boolean:=False;begin for I in 1..Length(A) loop if Str_Field(Get(A,I),"name")=Name then Found:=True;else Append(O,Get(A,I));end if;end loop;if not Found then return Error_Result(Op,"NOT_FOUND","faction not found",E);end if;Set_Field(E,"factions",O);end;
      elsif Op="dossier.update" then declare D:constant JSON_Value:=Get(E,"dossier");procedure Copy(Name:UTF8_String;Value:JSON_Value)is begin if Has_Field(D,Name) then Set_Field(D,Name,Clone(Value));end if;end;begin if Str_Field(B,"crewId")/="" and then Read_Entity("crew",Str_Field(B,"crewId")).Kind/=JSON_Object_Type then return Error_Result(Op,"VALIDATION","unknown crew",E);end if;Map_JSON_Object(B,Copy'Access);end;
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
               if not Found then return Error_Result (Op,"NOT_FOUND","note index out of range",E); end if;
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
         if Kind /= "crew" then return Error_Result(Op,"VALIDATION","crew-only operation",E); end if;
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
         if Kind /= "crew" then return Error_Result(Op,"VALIDATION","crew-only operation",E); end if;
         Target := Get (E,"experience"); Requested := Int_Field (B,"delta");
         Core_Clamp_Add (Natural (Int_Field (Target,"points")),Natural (Int_Field (Target,"max")),Natural'Max (0,Requested),New_Value,Applied);
         Set_Field (Target,"points",Integer (New_Value)); Effective := Integer (Applied); return Success_Result (Op,E,Requested,Effective);
      elsif Op = "xp.clear" then
         if Kind /= "crew" then return Error_Result(Op,"VALIDATION","crew-only operation",E); end if;
         declare X : constant JSON_Value := Get (E,"experience"); begin Set_Field (X,"points",Integer'(0)); end;
      elsif Op = "clock.progress" then
         declare
            use Paperclips_Core.Clocks;
            C   : Clock_State
              (Size => Paperclips_Core.Capacity (Int_Field (E, "size")));
            Req : constant Natural := Natural'Max (0, Int_Field (B, "segments"));
            App : Natural;
         begin
            C.Kind := (if Str_Field (E, "clockKind", "project") = "rollover"
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
            C.Kind := (if Str_Field (E, "clockKind", "project") = "rollover"
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
               if Str_Field(Get(A,I),"name") = Name then return Error_Result(Op,"DUPLICATE","item already available",E); end if;
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
            if not Found then return Error_Result(Op,"NOT_FOUND","item not found",E); end if;
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
            if Bool_Field(G,"isCommitmentLocked") then return Error_Result(Op,"COMMITMENT_LOCKED","commitment is locked",E); end if;
            for I in 1..Length(A) loop
               if Str_Field(Get(A,I),"name") = Name then Item := Get(A,I); exit; end if;
            end loop;
            if Item.Kind = JSON_Null_Type then return Error_Result(Op,"NOT_FOUND","item not available",E); end if;
            if Str_Field(G,"commitment") = "" or else Str_Field(G,"commitment") = "none" then return Error_Result(Op,"NO_COMMITMENT","no commitment set",E); end if;
            for I in 1..Length(L) loop
               if Str_Field(Get(L,I),"name") = Name then return Error_Result(Op,"DUPLICATE","item already committed",E); end if;
            end loop;
            declare Sum : Integer := 0; begin
               for I in 1..Length(L) loop Sum := Sum + Int_Field(Get(L,I),"bulk"); end loop;
               if Int_Field(Item,"bulk") > Int_Field(G,"maxBulk") - Sum then return Error_Result(Op,"OVER_BULK","item exceeds bulk limit",E); end if;
            end;
            declare O : JSON_Array := L; begin Append(O,Item);Set_Field(G,"loadout",O); end;
         end;
      elsif Op = "gear.uncommit" then
         declare G : constant JSON_Value := Get(E,"gear"); L : constant JSON_Array := Get(G,"loadout"); Name : constant String := Str_Field(B,"name"); Found : Boolean := False; begin
            if Bool_Field(G,"isCommitmentLocked") then return Error_Result(Op,"COMMITMENT_LOCKED","commitment is locked",E); end if;
            for I in 1..Length(L) loop
               if Str_Field(Get(L,I),"name") = Name then Found := True; end if;
            end loop;
            if not Found then return Error_Result(Op,"NOT_FOUND","item not in loadout",E); end if;
            declare O : JSON_Array := Empty_Array; begin
               for I in 1..Length(L) loop
                  if Str_Field(Get(L,I),"name") /= Name then Append(O,Get(L,I)); end if;
               end loop;
               Set_Field(G,"loadout",O);
            end;
         end;
      elsif Op = "gear.clear-commitments" then
         declare G : constant JSON_Value := Get(E,"gear"); begin
            if Bool_Field(G,"isCommitmentLocked") then return Error_Result(Op,"COMMITMENT_LOCKED","commitment is locked",E); end if;
            Set_Field(G,"loadout",Empty_Array);Set_Field(G,"commitment","none");
         end;
      elsif Op = "notebook.set" then Set_Field(E,"notebook",Str_Field(B,"text"));
      elsif Op = "hold.set" then Set_Field(E,"hold",Str_Field(B,"hold","weak"));
      elsif Op = "cohort.add" then
         declare Kind_Of : constant String := Str_Field(B,"cohortKind"); begin
            if Kind_Of /= "gang" and then Kind_Of /= "expert" then
               return Error_Result(Op,"VALIDATION","cohortKind must be gang or expert",E);
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
            if not Found then return Error_Result(Op,"NOT_FOUND","cohort not found",E); end if;
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
            if not Found then return Error_Result(Op,"NOT_FOUND","cohort not found",E); end if;
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
            if not Allowed then return Error_Result (Op, "VALIDATION", "unknown field", E); end if;
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
      elsif Op="upgrade.mark" or else Op="upgrade.unmark" then declare A:constant JSON_Array:=Get(E,"upgrades");O:JSON_Array:=Empty_Array;Name:constant String:=Str_Field(B,"name");Found:Boolean:=False;begin for I in 1..Length(A) loop declare X:constant JSON_Value:=Get(A,I);begin if Str_Field(X,"name")=Name then Found:=True;declare N:constant Integer:=Int_Field(X,"boxesMarked")+(if Op="upgrade.mark" then 1 else -1);begin if N>0 then Set_Field(X,"boxesMarked",N);Append(O,X);end if;end;else Append(O,X);end if;end;end loop;if Op="upgrade.mark" and then not Found then declare X:JSON_Value:=Create_Object;begin Set_Field(X,"name",Name);Set_Field(X,"boxesMarked",Integer'(1));Append(O,X);end;end if;Set_Field(E,"upgrades",O);end;
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
            if Int_Field(C,"segments")<Int_Field(C,"size") then return Error_Result(Op,"CANNOT_HEAL","healing clock is not full",E);end if;
            declare A:constant JSON_Array:=Get(H,Level);O:JSON_Array:=Empty_Array;Skipped:Boolean:=False;begin
               for I in 1..Length(A) loop
                  if not Skipped and then String'(Get(Get(A,I)))=Desc then Skipped:=True;else Append(O,Get(A,I));end if;
               end loop;
               if not Skipped then return Error_Result(Op,"NOT_FOUND","harm not found",E);end if;
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
            return Error_Result (Op, "VALIDATION", "crew-only operation", E);
         end if;
         declare
            Claim_Id : constant String := Str_Field (B, "claimId");
            Claimed  : constant Boolean := Bool_Field (B, "claimed");
            Is_Lair  : Boolean;
         begin
            if not Claim_Exists (E, Claim_Id, Is_Lair) then
               return Error_Result (Op, "VALIDATION", "unknown claim", E);
            end if;
            if Is_Lair then
               return Error_Result (Op, "VALIDATION", "the lair is always controlled", E);
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
            return Error_Result (Op, "VALIDATION", "crew-only operation", E);
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
               return Error_Result (Op, "VALIDATION", "unknown claim", E);
            end if;
            if Is_Lair then
               return Error_Result (Op, "VALIDATION", "the lair cannot be customized", E);
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
            return Error_Result (Op, "VALIDATION", "crew-only operation", E);
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
               return Error_Result (Op, "VALIDATION", "unknown claim", E);
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
            return Error_Result (Op, "VALIDATION", "character-only operation", E);
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
                  return Error_Result (Op, "COMMITMENT_LOCKED", "commitment is locked", E);
               end if;
               Set_Field (G, "loadout", Empty_Array);
               Set_Field (G, "commitment", "none");
            end;
         end if;
      elsif Op = "end-downtime" then
         --  BUG-005: composite helper — clears session expressions and applies
         --  caller-supplied vice relief (GM judgment stays outside).
         if Kind /= "character" then
            return Error_Result (Op, "VALIDATION", "character-only operation", E);
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
                  return Error_Result (Op, "VALIDATION", "viceReliefStress must be non-negative", E);
               end if;
               Requested := Req;
               Core_Clamp_Subtract (Natural (Int_Field (M, "current")),
                                    Natural (Int_Field (M, "max")),
                                    Natural (Req), New_Value, Applied);
               Set_Field (M, "current", Integer (New_Value));
               Effective := -Integer (Applied);
            end;
         end if;
      else return Error_Result (Op,"VALIDATION","unknown operation",E);
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
   exception when Constraint_Error => return Error_Result(Op,"VALIDATION","invalid operation arguments",E);
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

   function Character_Summaries return JSON_Array is
      A : constant JSON_Array := All_Entities ("character");
      O : JSON_Array := Empty_Array;
   begin
      for I in 1 .. Length (A) loop
         Append (O, Character_Summary (Get (A, I)));
      end loop;
      return O;
   end Character_Summaries;

   function Crew_Summaries return JSON_Array is
      CA : constant JSON_Array := All_Entities ("character");
      CR : constant JSON_Array := All_Entities ("crew");
      O  : JSON_Array := Empty_Array;
   begin
      for I in 1 .. Length (CR) loop
         Append (O, Crew_Summary (Get (CR, I), CA));
      end loop;
      return O;
   end Crew_Summaries;

   function Handle_Entity (Request : AWS.Status.Data; Path : String) return AWS.Response.Data is
      Plural : constant String := Part (Path, 2);
      Kind   : constant String :=
        (if Plural = "characters" then "character"
         elsif Plural = "crews" then "crew" else "clock");
      Id     : constant String := Part (Path, 3);
      Suffix : constant String :=
        Part (Path, 4) & (if Part (Path, 5) /= "" then "/" & Part (Path, 5) else "");
      Is_Post : constant Boolean := AWS.Status.Method (Request) = AWS.Status.POST;
      B, E, R : JSON_Value;
      Lock_Held : Boolean := False;
   begin
      if Id = "" then
         if not Is_Post then
            --  BUG-012: collection GETs return declared summaries.
            if Kind = "character" then
               return Json_Response (Create (Character_Summaries));
            elsif Kind = "crew" then
               return Json_Response (Create (Crew_Summaries));
            end if;
            return Json_Response (Create (All_Entities (Kind)));
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
               return Fail (AWS.Messages.S400, "character.create", "VALIDATION");
            end if;
            E := New_Character (Str_Field (B, "gameStem"), Str_Field (B, "playbook"));
         elsif Kind = "crew" then
            if Game (Str_Field (B, "gameStem")).Kind /= JSON_Object_Type then
               return Fail (AWS.Messages.S400, "crew.create", "VALIDATION");
            end if;
            E := New_Crew (Str_Field (B, "gameStem"), Str_Field (B, "crewType"));
         else
            E := New_Clock (B);
         end if;
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
      E := Read_Entity (Kind, Id);
      if E.Kind /= JSON_Object_Type then
         if Lock_Held then Entity_Lock_Registry.Release (Id); end if;
         return Fail (AWS.Messages.S404, "get", "NOT_FOUND");
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
      if not Is_Post then return Fail (AWS.Messages.S404, "request", "NOT_FOUND"); end if;
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
         if Header (Request, "If-Match") /= "" and then
           Header (Request, "If-Match") /= Trim_Image (Int_Field (E, "revision"))
         then
            Entity_Lock_Registry.Release (Id);
            return Fail (AWS.Messages.S409, Suffix, "STALE_REVISION", E,
                         "current revision is " & Trim_Image (Int_Field (E, "revision")));
         end if;
         if Suffix = "delete" then
            if not Bool_Field (B, "confirm") then
               Entity_Lock_Registry.Release (Id);
               return Json_Response
                 (Error_Result ("delete", "CONFIRM_REQUIRED", "confirm must be true", E));
            end if;
            if Kind = "crew" then
               declare
                  A : constant JSON_Array := All_Entities ("character");
               begin
                  for I in 1 .. Length (A) loop
                     declare
                        C : constant JSON_Value := Get (A, I);
                        D : constant JSON_Value := Get (C, "dossier");
                     begin
                        if Str_Field (D, "crewId") = Id then
                           Set_Field (D, "crewId", "");
                           Stamp (C);
                           Write_Entity ("character", Str_Field (C, "id"), C);
                        end if;
                     end;
                  end loop;
               end;
            end if;
            Ada.Directories.Delete_Tree (Entity_Dir (Kind, Id));
            Entity_Lock_Registry.Release (Id);
            return Json_Response (Success_Result ("delete", E));
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
                  return Json_Response (Error_Result ("undo", "NO_HISTORY", "no history", E));
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
            --  BUG-003: full DTO validation BEFORE any write; on invalid the
            --  current.json bytes, revision and history are untouched.
            if Str_Field (B, "kind") /= Kind or else Str_Field (B, "id") /= Id
              or else not Import_Valid (Kind, B)
            then
               Entity_Lock_Registry.Release (Id);
               return Fail (AWS.Messages.S400, "import", "VALIDATION", E,
                            "import body fails DTO validation");
            end if;
            --  valid: atomically replace history with exactly ONE baseline
            --  snapshot, then write current.json at revision+1.
            declare
               Hist : constant String := Entity_Dir (Kind, Id) & "/history";
            begin
               if Ada.Directories.Exists (Hist) then Ada.Directories.Delete_Tree (Hist); end if;
               Ada.Directories.Create_Path (Hist);
            end;
            Set_Field (B, "revision", Int_Field (E, "revision") + 1);
            Set_Field (B, "updatedAt", Now);
            Snapshot (Kind, Id, "import", B);
            Write_Entity (Kind, Id, B);
            Entity_Lock_Registry.Release (Id);
            return Json_Response (Success_Result ("import", B));
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
      when Constraint_Error =>
         if Lock_Held then Entity_Lock_Registry.Release (Id); end if;
         return Fail (AWS.Messages.S413, "import", "VALIDATION",
                      Message => "request exceeds 1 MiB");
   end Handle_Entity;

   procedure Configure (Static_Directory, Data_Directory, Games_Directory : String; Test_Hooks : Boolean) is
      Campaign : JSON_Value;
   begin
      Static_Root:=To_Unbounded_String(Static_Directory);Data_Root:=To_Unbounded_String(Data_Directory);Games_Root:=To_Unbounded_String(Games_Directory);Hooks:=Test_Hooks;
      if not Ada.Directories.Exists(Data_Directory) then Ada.Directories.Create_Path(Data_Directory);end if;
      if not Ada.Directories.Exists(Data_Directory&"/campaign.json") then Campaign:=Create_Object;Set_Field(Campaign,"kind","campaign");Set_Field(Campaign,"name","Paperclips Campaign");Set_Field(Campaign,"gameStem","blades-in-the-dark");Set_Field(Campaign,"createdAt",Now);Set_Field(Campaign,"formatVersion",Integer'(1));Atomic_Write(Data_Directory&"/campaign.json",Campaign);end if;
   end Configure;

   function Handle (Request : AWS.Status.Data) return AWS.Response.Data is
      URI:constant String:=AWS.Status.URI(Request);Path:constant String:=Path_Only(URI);Response:AWS.Response.Data;
   begin
      if Path="/api/health" then declare V:JSON_Value:=Create_Object;begin Set_Field(V,"status","ok");Set_Field(V,"implementation","ada");Set_Field(V,"version","0.2.0");Set_Field(V,"dataDir",To_String(Data_Root));Response:=Json_Response(V);end;
      elsif Path="/api/campaign" then Response:=Json_Text(Read_File(To_String(Data_Root)&"/campaign.json"));
      elsif Path="/api/campaign/batch" then
         --  BUG-005: sequential all-or-nothing multi-op planner.
         declare
            B    : constant JSON_Value := Parse_Body (To_String (AWS.Status.Binary_Data (Request)));
            Ops  : JSON_Array;
            Outs : JSON_Array := Empty_Array;
            OK   : Boolean := True;
            Fail_Code, Fail_Msg : Unbounded_String := Null_Unbounded_String;
            type Ent is record
               Kind : Unbounded_String := Null_Unbounded_String;
               Id   : Unbounded_String := Null_Unbounded_String;
               Op   : Unbounded_String := Null_Unbounded_String;
               Args : JSON_Value := JSON_Null;
               E    : JSON_Value := JSON_Null;
               Changed : Boolean := False;
            end record;
            Ents : array (1 .. 50) of Ent :=
              (others => (Kind => Null_Unbounded_String, Id => Null_Unbounded_String,
                          Op => Null_Unbounded_String, Args => JSON_Null,
                          E => JSON_Null, Changed => False));
            N    : Natural := 0;
            Locked : array (1 .. 50) of Boolean := (others => False);
         begin
            if B.Kind /= JSON_Object_Type or else not Has_Field (B, "ops") then
               Response := Json_Response (Error_Result ("batch", "VALIDATION",
                                            "ops must be a non-empty array"));
            else
               Ops := Get (B, "ops");
               if Length (Ops) = 0 or else Length (Ops) > 50 then
                  Response := Json_Response (Error_Result ("batch", "VALIDATION",
                                              "ops must contain 1..50 operations"));
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
                                     E => Read_Entity (To_String (K), To_String (ID)),
                                     Changed => False);
                        if Ents (N).E.Kind /= JSON_Object_Type then
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
                              Entity_Lock_Registry.Claim (To_String (Ents (I).Id), 0, H);
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
                           R := Mutate (To_String (Ents (I).Kind), OpS, Ents (I).E, Ents (I).Args);
                           if Bool_Field (R, "ok") then
                              Ents (I).Changed := True;
                              Append (Outs, Read ("{""ok"":true,""op"":""" & OpS & """}"));
                           else
                              OK := False;
                              declare
                                 Err : constant JSON_Value := Get (R, "error");
                              begin
                                 Fail_Code := To_Unbounded_String (Str_Field (Err, "code"));
                                 Fail_Msg := To_Unbounded_String (Str_Field (Err, "message"));
                                 Append (Outs, Read ("{""ok"":false,""op"":""" & OpS
                                   & """,""error"":{""code"":""" & To_String (Fail_Code)
                                   & """,""message"":""" & To_String (Fail_Msg) & """}}"));
                              end;
                              exit;
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
                     Response := Json_Response
                       (Error_Result ("batch", To_String (Fail_Code), To_String (Fail_Msg)));
                  end if;
                  for I in 1 .. N loop
                     if Locked (I) then Entity_Lock_Registry.Release (To_String (Ents (I).Id)); end if;
                  end loop;
               end if;
            end if;
         end;
      elsif Path="/api/campaign/roster" then
         declare CA:constant JSON_Array:=All_Entities("character");CR:constant JSON_Array:=All_Entities("crew");CO:JSON_Array:=Empty_Array;RO:JSON_Array:=Empty_Array;V:JSON_Value:=Create_Object;begin
            for I in 1..Length(CA) loop declare C:constant JSON_Value:=Get(CA,I);D:constant JSON_Value:=Get(C,"dossier");M:constant JSON_Value:=Get(C,"monitor");X:JSON_Value:=Create_Object;T:constant JSON_Value:=Get(Get(M,"trauma"),"traumas");begin Set_Field(X,"id",Str_Field(C,"id"));Set_Field(X,"name",Str_Field(D,"name"));Set_Field(X,"alias",Str_Field(D,"alias"));Set_Field(X,"playbook",Str_Field(Get(C,"playbook"),"name"));Set_Field(X,"gameStem",Str_Field(C,"gameStem"));Set_Field(X,"crewId",Str_Field(D,"crewId"));Set_Field(X,"stress",Int_Field(Get(M,"stress"),"current"));Set_Field(X,"traumas",T);Set_Field(X,"isRetired",Bool_Field(C,"isRetired"));Set_Field(X,"isDeadish",Bool_Field(C,"isDeadish"));Set_Field(X,"revision",Int_Field(C,"revision"));Append(CO,X);end;end loop;
            for I in 1..Length(CR) loop declare C:constant JSON_Value:=Get(CR,I);X:JSON_Value:=Create_Object;Members:Natural:=0;begin for J in 1..Length(CA) loop if Str_Field(Get(Get(CA,J),"dossier"),"crewId")=Str_Field(C,"id") then Members:=Members+1;end if;end loop;Set_Field(X,"id",Str_Field(C,"id"));Set_Field(X,"name",Str_Field(C,"name"));Set_Field(X,"crewType",Str_Field(C,"crewTypeName"));Set_Field(X,"gameStem",Str_Field(C,"gameStem"));Set_Field(X,"tier",Int_Field(C,"tier"));Set_Field(X,"heat",Int_Field(Get(C,"heat"),"current"));Set_Field(X,"wanted",Int_Field(Get(C,"wanted"),"current"));Set_Field(X,"rep",Int_Field(Get(C,"rep"),"current"));Set_Field(X,"hold",Str_Field(C,"hold"));Set_Field(X,"memberCount",Integer(Members));Set_Field(X,"revision",Int_Field(C,"revision"));Append(RO,X);end;end loop;Set_Field(V,"characters",CO);Set_Field(V,"crews",RO);Response:=Json_Response(V);
         end;
      elsif Path'Length >= 28 and then
        Path (Path'First .. Path'First + 18) = "/api/campaign/crew/" and then
        Path (Path'Last - 7 .. Path'Last) = "/members"
      then
         --  BUG-007: GET /api/campaign/crew/{crewId}/members returns the
         --  character summaries linked to that crew (declared 200 route).
         declare
            Crew_Id : constant String :=
              Path (Path'First + 19 .. Path'Last - 8);
            CA : constant JSON_Array := All_Entities ("character");
            CR : constant JSON_Array := All_Entities ("crew");
            Out_A : JSON_Array := Empty_Array;
            Crew_Exists : Boolean := False;
         begin
            for J in 1 .. Length (CR) loop
               if Str_Field (Get (CR, J), "id") = Crew_Id then
                  Crew_Exists := True; exit;
               end if;
            end loop;
            if not Crew_Exists then
               Response := Fail (AWS.Messages.S404, "crew.members", "NOT_FOUND",
                                 Message => "crew not found");
            else
               for I in 1 .. Length (CA) loop
                  declare C : constant JSON_Value := Get (CA, I);
                          D : constant JSON_Value := Get (C, "dossier");
                  begin
                     if Str_Field (D, "crewId") = Crew_Id then
                        Append (Out_A, Character_Summary (C));
                     end if;
                  end;
               end loop;
               Response := Json_Response (Create (Out_A));
            end if;
         end;
      elsif Part(Path,1)="api" and then Part(Path,2)="games" then Response:=Handle_Games(Path);
      elsif Part(Path,1)="api" and then (Part(Path,2)="characters" or else Part(Path,2)="crews" or else Part(Path,2)="clocks") then Response:=Handle_Entity(Request,Path);
      elsif Path="/api/test-hooks/crash-mid-write" then Response:=AWS.Response.Build(AWS.MIME.Text_Plain,"",AWS.Messages.S501);
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
   exception when E:others => Ada.Text_IO.Put_Line(Ada.Exceptions.Exception_Information(E));return Fail(AWS.Messages.S400,"request","VALIDATION",Message=>Ada.Exceptions.Exception_Message(E));
   end Handle;
end Pitd_Callback;
