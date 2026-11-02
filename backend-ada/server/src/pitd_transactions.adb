with Ada.Containers.Indefinite_Ordered_Sets;
with Ada.Directories;
with Ada.Strings.Unbounded;
with GNAT.OS_Lib;
with GNAT.SHA256;
with Pitd_Common;
with Pitd_Error;
with Pitd_Normalize;
with Pitd_Stored;

package body Pitd_Transactions is
   use Ada.Strings.Unbounded;
   use Pitd_Common;
   use Pitd_Error;
   package Names is new Ada.Containers.Indefinite_Ordered_Sets (String);

   function Root return String is (To_String (Data_Root));
   function Receipt_Name (Character_Id, Completion_Id : String) return String is
     ("flow-receipts/" & Character_Id & "/" & GNAT.SHA256.Digest (Completion_Id) & ".json");

   function New_Plan (Op : String) return JSON_Value is
      P : constant JSON_Value := Create_Object;
   begin
      Set_Field (P, "id", New_Snapshot_Id);
      Set_Field (P, "op", Op);
      Set_Field (P, "takenAt", Now);
      Set_Field (P, "isUndo", Op = "undo");
      Set_Field (P, "participants", Empty_Array);
      Set_Field (P, "receipts", Empty_Array);
      Set_Field (P, "consume", Empty_Array);
      Set_Field (P, "groupUpdates", Empty_Array);
      Set_Field (P, "removeSnapshots", Empty_Array);
      return P;
   end New_Plan;

   procedure Stage
     (Plan : JSON_Value; Before, After : JSON_Value;
      Take_Snapshot : Boolean := True) is
      A : JSON_Array := Get (Plan, "participants");
      Item : JSON_Value := JSON_Null;
   begin
      for I in 1 .. Length (A) loop
         if Str_Field (Get (A, I), "kind") = Str_Field (After, "kind")
           and then Str_Field (Get (A, I), "id") = Str_Field (After, "id")
         then
            Item := Get (A, I);
            exit;
         end if;
      end loop;
      if Item.Kind = JSON_Null_Type then
         Item := Create_Object;
         Set_Field (Item, "kind", Str_Field (After, "kind"));
         Set_Field (Item, "id", Str_Field (After, "id"));
         Set_Field (Item, "before", Before);
         Set_Field (Item, "snapshotId", (if Take_Snapshot then Str_Field (Plan, "id") else ""));
         Append (A, Item);
         Set_Field (Plan, "participants", A);
      end if;
      Set_Field (Item, "after", After);
   end Stage;

   procedure Stage_Receipt
     (Plan, Receipt : JSON_Value; Character_Id : String; Payload_Hash : String) is
      A : JSON_Array := Get (Plan, "receipts");
      Item : constant JSON_Value := Create_Object;
   begin
      Set_Field (Item, "characterId", Character_Id);
      Set_Field (Item, "receipt", Receipt);
      Set_Field (Item, "payloadHash", Payload_Hash);
      Append (A, Item);
      Set_Field (Plan, "receipts", A);
   end Stage_Receipt;

   function Receipt (Character_Id, Completion_Id : String) return JSON_Value is
      Name : constant String := Root & "/" & Receipt_Name (Character_Id, Completion_Id);
   begin
      if not Ada.Directories.Exists (Name) then return JSON_Null; end if;
      return Read (Read_File (Name));
   end Receipt;

   function Active_Receipt
     (Character_Id, Instance_Id, Kind, Step : String) return JSON_Value is
      Base : constant String := Root & "/flow-receipts/" & Character_Id;
      Search : Ada.Directories.Search_Type;
      Entry_Item : Ada.Directories.Directory_Entry_Type;
      Found : JSON_Value := JSON_Null;
   begin
      if not Ada.Directories.Exists (Base) then return Found; end if;
      Ada.Directories.Start_Search
        (Search, Base, "*.json", (Ada.Directories.Ordinary_File => True, others => False));
      while Ada.Directories.More_Entries (Search) loop
         Ada.Directories.Get_Next_Entry (Search, Entry_Item);
         declare
            Stored : constant JSON_Value := Read (Read_File (Ada.Directories.Full_Name (Entry_Item)));
            R : constant JSON_Value := Get (Stored, "receipt");
         begin
            if Str_Field (R, "instanceId") = Instance_Id
              and then Str_Field (R, "kind") = Kind
              and then Str_Field (R, "step") = Step
              and then Str_Field (R, "status") = "completed"
            then Found := R; exit; end if;
         end;
      end loop;
      Ada.Directories.End_Search (Search);
      return Found;
   end Active_Receipt;

   function Snapshot_Group (Snapshot_Id : String) return JSON_Value is
      Name : constant String := Root & "/flow-groups/" & Snapshot_Id & ".json";
   begin
      if not Safe (Snapshot_Id) or else not Ada.Directories.Exists (Name) then
         return JSON_Null;
      end if;
      return Read (Read_File (Name));
   end Snapshot_Group;

   function Newest_Snapshot (Kind, Id : String) return String is
      A : constant JSON_Array := History (Kind, Id);
   begin
      if Length (A) = 0 then return ""; end if;
      return Str_Field (Get (A, 1), "snapshotId");
   end Newest_Snapshot;

   function Predecessor (Kind, Id, Removed_Id : String) return JSON_Value is
      A : constant JSON_Array := History (Kind, Id);
      Found : Boolean := False;
   begin
      for I in 1 .. Length (A) loop
         if Found then return Snapshot_Group (Str_Field (Get (A, I), "snapshotId")); end if;
         Found := Str_Field (Get (A, I), "snapshotId") = Removed_Id;
      end loop;
      return JSON_Null;
   end Predecessor;

   function Advance_Predecessor
     (Plan : JSON_Value; Kind, Id, Removed_Id : String; Revision : Integer) return Boolean is
      Group : JSON_Value := Predecessor (Kind, Id, Removed_Id);
      Updates : JSON_Array := Get (Plan, "groupUpdates");
      Present : Boolean := False;
   begin
      if Group.Kind /= JSON_Object_Type then return False; end if;
      for I in 1 .. Length (Updates) loop
         if Str_Field (Get (Updates, I), "id") = Str_Field (Group, "id") then
            Group := Get (Updates, I); Present := True; exit;
         end if;
      end loop;
      declare A : constant JSON_Array := Get (Group, "participants"); begin
         for I in 1 .. Length (A) loop
            declare P : constant JSON_Value := Get (A, I); begin
               if Str_Field (P, "kind") = Kind and then Str_Field (P, "id") = Id then
                  Set_Field (P, "guardRevision", Revision);
               end if;
            end;
         end loop;
      end;
      if not Present then Append (Updates, Group); Set_Field (Plan, "groupUpdates", Updates); end if;
      return True;
   end Advance_Predecessor;

   function Group_Locks (Group : JSON_Value) return JSON_Array is
      Ordered : Names.Set;
      A : constant JSON_Array := Get (Group, "participants");
      Keys : JSON_Array := Empty_Array;
      procedure Include_Participants (Participants : JSON_Array) is
      begin
         for I in 1 .. Length (Participants) loop
            declare P : constant JSON_Value := Get (Participants, I); begin
               Ordered.Include (Str_Field (P, "kind") & "/" & Str_Field (P, "id"));
               if Str_Field (P, "kind") = "character" then
                  declare Cid : constant String := Str_Field (Get (Get (P, "before"), "dossier"), "crewId"); begin
                     if Cid /= "" then Ordered.Include ("crew/" & Cid); end if;
                  end;
               end if;
            end;
         end loop;
      end Include_Participants;
   begin
      Include_Participants (A);
      for I in 1 .. Length (A) loop
         declare P : constant JSON_Value := Get (A, I);
            Previous : constant JSON_Value := Predecessor
              (Str_Field (P, "kind"), Str_Field (P, "id"), Str_Field (P, "snapshotId"));
         begin
            if Previous.Kind = JSON_Object_Type then
               Include_Participants (JSON_Array'(Get (Previous, "participants")));
            end if;
         end;
      end loop;
      if Has_Field (Group, "groupUpdates") then
         declare Updates : constant JSON_Array := Get (Group, "groupUpdates"); begin
            for I in 1 .. Length (Updates) loop
               Include_Participants (JSON_Array'(Get (Get (Updates, I), "participants")));
            end loop;
         end;
      end if;
      for Key of Ordered loop Append (Keys, Create (Key)); end loop;
      return Keys;
   end Group_Locks;

   function Undo_Locks (Kind, Id, Snapshot_Id : String; Document : JSON_Value) return JSON_Array is
      Group : constant JSON_Value := Create_Object;
      P : constant JSON_Value := Create_Object;
      A : JSON_Array := Empty_Array;
   begin
      Set_Field (P, "kind", Kind); Set_Field (P, "id", Id);
      Set_Field (P, "snapshotId", Snapshot_Id); Set_Field (P, "before", Document);
      Append (A, P); Set_Field (Group, "participants", A);
      return Group_Locks (Group);
   end Undo_Locks;

   procedure Publish_Entities (Plan : JSON_Value) is
      A : constant JSON_Array := Get (Plan, "participants");
      Receipts : constant JSON_Array := Get (Plan, "receipts");
      Consumed : constant JSON_Array := Get (Plan, "consume");
   begin
      --  Snapshot names and contents are fixed in the intent. Publishing the
      --  same intent again after a crash cannot append history or bump revision.
      for I in 1 .. Length (A) loop
         declare
            P : constant JSON_Value := Get (A, I);
            Kind : constant String := Str_Field (P, "kind");
            Id : constant String := Str_Field (P, "id");
            Sid : constant String := Str_Field (P, "snapshotId");
         begin
            if Sid /= "" then
               Publish_Transaction_Snapshot
                 (Kind, Id, Sid, Str_Field (Plan, "op"), Str_Field (Plan, "takenAt"), Get (P, "before"));
            end if;
            Write_Entity (Kind, Id, Get (P, "after"));
         end;
      end loop;
      for I in 1 .. Length (Receipts) loop
         declare
            Item : constant JSON_Value := Get (Receipts, I);
            R : constant JSON_Value := Get (Item, "receipt");
         begin
            Write_Transaction_Metadata
              (Receipt_Name (Str_Field (Item, "characterId"), Str_Field (R, "completionId")), Item);
         end;
      end loop;
      if not Bool_Field (Plan, "isUndo") then
         Write_Transaction_Metadata ("flow-groups/" & Str_Field (Plan, "id") & ".json", Plan);
      else
         for I in 1 .. Length (Consumed) loop
            declare
               Group : constant JSON_Value := Get (Consumed, I);
               Participants : constant JSON_Array := Get (Group, "participants");
            begin
               for J in 1 .. Length (Participants) loop
                  declare P : constant JSON_Value := Get (Participants, J); begin
                     Consume_Transaction_Snapshot
                       (Str_Field (P, "kind"), Str_Field (P, "id"), Str_Field (P, "snapshotId"));
                  end;
               end loop;
               Set_Field (Group, "undone", True);
               Write_Transaction_Metadata ("flow-groups/" & Str_Field (Group, "id") & ".json", Group);
            end;
         end loop;
      end if;
      declare
         Removed : constant JSON_Array := Get (Plan, "removeSnapshots");
         Updates : constant JSON_Array := Get (Plan, "groupUpdates");
      begin
         for I in 1 .. Length (Removed) loop
            declare P : constant JSON_Value := Get (Removed, I); begin
               Consume_Transaction_Snapshot (Str_Field (P, "kind"), Str_Field (P, "id"), Str_Field (P, "snapshotId"));
            end;
         end loop;
         for I in 1 .. Length (Updates) loop
            declare Group : constant JSON_Value := Get (Updates, I); begin
               Write_Transaction_Metadata ("flow-groups/" & Str_Field (Group, "id") & ".json", Group);
            end;
         end loop;
      end;
      for I in 1 .. Length (A) loop
         declare P : constant JSON_Value := Get (A, I); begin
            Prune_History (Str_Field (P, "kind"), Str_Field (P, "id"));
            Rebuild_Index (Str_Field (P, "kind"), Str_Field (P, "id"));
         end;
      end loop;
      Delete_Transaction_Metadata ("transactions/" & Str_Field (Plan, "id") & ".json");
   end Publish_Entities;

   --  Campaign-wide readers see this publish whole or not at all.
   procedure Publish (Plan : JSON_Value) is
   begin
      Publication_Gate.Begin_Publish;
      begin
         Publish_Entities (Plan);
      exception
         when others =>
            Publication_Gate.End_Publish;
            raise;
      end;
      Publication_Gate.End_Publish;
   end Publish;

   procedure Commit (Plan : JSON_Value) is
      A : constant JSON_Array := Get (Plan, "participants");
   begin
      --  The complete plan is admitted before the durable decision to commit.
      for I in 1 .. Length (A) loop
         declare P : constant JSON_Value := Get (A, I); begin
            Require_Entity_Write (Str_Field (P, "kind"), Str_Field (P, "id"), Get (P, "after"));
         end;
      end loop;
      begin
         Write_Transaction_Metadata ("transactions/" & Str_Field (Plan, "id") & ".json", Plan);
         Publish (Plan);
      exception
         when others =>
            --  Once the intent is durable, rollback is no longer an option.
            --  Fail closed rather than serve a partially published campaign;
            --  startup rolls the exact after-documents forward before listening.
            GNAT.OS_Lib.OS_Exit (1);
      end;
   end Commit;

   procedure Recover is
      Base : constant String := Root & "/transactions";
      Search : Ada.Directories.Search_Type;
      Entry_Item : Ada.Directories.Directory_Entry_Type;
      Pending : Names.Set;
   begin
      if not Ada.Directories.Exists (Base) then return; end if;
      Ada.Directories.Start_Search
        (Search, Base, "*.json", (Ada.Directories.Ordinary_File => True, others => False));
      while Ada.Directories.More_Entries (Search) loop
         Ada.Directories.Get_Next_Entry (Search, Entry_Item);
         Pending.Include (Ada.Directories.Full_Name (Entry_Item));
      end loop;
      Ada.Directories.End_Search (Search);
      for Name of Pending loop
         declare
            Plan : constant JSON_Value := Read (Read_File (Name));
            Keys : constant JSON_Array := Group_Locks (Plan);
            Held : Boolean;
         begin
            Entity_Lock_Registry.Claim_Set (Keys, Held);
            if not Held then raise Program_Error with "startup recovery lock contention"; end if;
            begin
               Publish (Plan);
            exception
               when others => Entity_Lock_Registry.Release_Set (Keys); raise;
            end;
            Entity_Lock_Registry.Release_Set (Keys);
         end;
      end loop;
   end Recover;

   function Undo_Single
     (Kind, Id, Snapshot_Id : String; Current, Restored : JSON_Value) return Boolean is
      Plan : constant JSON_Value := New_Plan ("undo");
      Removed : JSON_Array := Empty_Array;
      P : constant JSON_Value := Create_Object;
   begin
      if not Advance_Predecessor (Plan, Kind, Id, Snapshot_Id, Int_Field (Restored, "revision")) then
         return False;
      end if;
      Stage (Plan, Current, Restored, Take_Snapshot => False);
      Set_Field (P, "kind", Kind); Set_Field (P, "id", Id); Set_Field (P, "snapshotId", Snapshot_Id);
      Append (Removed, P); Set_Field (Plan, "removeSnapshots", Removed);
      Commit (Plan);
      return True;
   end Undo_Single;

   function Undo (Group : JSON_Value; Kind, Id : String) return JSON_Value is
      A : constant JSON_Array := Get (Group, "participants");
      Old_Receipts : constant JSON_Array := Get (Group, "receipts");
      Plan : constant JSON_Value := New_Plan ("undo");
      Root_Entity : JSON_Value := JSON_Null;
      Consumed : JSON_Array := Empty_Array;
   begin
      if Bool_Field (Group, "undone") then
         return Stale_Error ("undo", Read_Entity (Kind, Id), Int_Field (Read_Entity (Kind, Id), "revision"));
      end if;
      for I in 1 .. Length (A) loop
         declare
            P : constant JSON_Value := Get (A, I);
            K : constant String := Str_Field (P, "kind");
            Entity_Id : constant String := Str_Field (P, "id");
            Current, Context : JSON_Value;
            Issues : JSON_Array;
            Canonical : Boolean;
            Before : constant JSON_Value := Get (P, "before");
            After : constant JSON_Value := Get (P, "after");
         begin
            if not Ada.Directories.Exists (Current_File (K, Entity_Id)) then
               return Not_Found_Error ("undo", "transaction participant no longer exists: " & K & "/" & Entity_Id);
            end if;
            Pitd_Stored.Classify_Stored
              (K, Entity_Id, Read_File (Current_File (K, Entity_Id)),
               Current, Context, Issues, Canonical);
            if not Canonical then return Invalid_Entity_Error ("undo", Issues); end if;
            if Int_Field (Current, "revision") /= Int_Field (P, "guardRevision", Int_Field (After, "revision"))
              or else Newest_Snapshot (K, Entity_Id) /= Str_Field (P, "snapshotId")
            then
               return Stale_Error ("undo", Current, Int_Field (Current, "revision"));
            end if;
            declare Missing : constant String := Missing_Reference (K, Before); begin
               if Missing /= "" then
                  return Not_Found_Error ("undo", "snapshot reference no longer exists: " & Missing, Current);
               end if;
            end;
            declare Restored : constant JSON_Value := Clone (Before); begin
               Set_Field (Restored, "revision", Int_Field (Current, "revision") + 1);
               Set_Field (Restored, "updatedAt", Now);
               --  a grouped restore must meet the same cohort bound as a single undo:
               --  the settings-derived maximum may have dropped since the snapshot
               if K = "crew" then
                  declare Bound_Issues : constant JSON_Array := Pitd_Normalize.Cohort_Type_Issues (Restored); begin
                     if Length (Bound_Issues) > 0 then
                        return Invalid_Entry_Error ("undo", Bound_Issues);
                     end if;
                  end;
               end if;
               Stage (Plan, Current, Restored, Take_Snapshot => False);
               declare Advanced : constant Boolean := Advance_Predecessor
                 (Plan, K, Entity_Id, Str_Field (P, "snapshotId"), Int_Field (Restored, "revision"));
                  pragma Unreferenced (Advanced);
               begin null; end;
               if K = Kind and then Entity_Id = Id then Root_Entity := Restored; end if;
            end;
         end;
      end loop;
      for I in 1 .. Length (Old_Receipts) loop
         declare
            Item : constant JSON_Value := Get (Old_Receipts, I);
            R : constant JSON_Value := Clone (Get (Item, "receipt"));
         begin
            Set_Field (R, "status", "undone");
            Stage_Receipt (Plan, R, Str_Field (Item, "characterId"), Str_Field (Item, "payloadHash"));
         end;
      end loop;
      Append (Consumed, Clone (Group));
      Set_Field (Plan, "consume", Consumed);
      Commit (Plan);
      return Success_Result ("undo", Root_Entity);
   end Undo;
end Pitd_Transactions;
