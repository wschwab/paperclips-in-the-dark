with GNATCOLL.JSON;

--  Recoverable multi-document publication for guided completion and grouped undo.
--  Callers own every participant lock before planning/committing. Recovery runs
--  before the HTTP listener starts, and acquires the same complete lock sets.
package Pitd_Transactions is
   pragma SPARK_Mode (Off);
   use GNATCOLL.JSON;

   function New_Plan (Op : String) return JSON_Value;
   procedure Stage
     (Plan : JSON_Value; Before, After : JSON_Value;
      Take_Snapshot : Boolean := True);
   procedure Stage_Receipt
     (Plan, Receipt : JSON_Value; Character_Id : String; Payload_Hash : String;
      Side_Effects : JSON_Array := Empty_Array);
   procedure Commit (Plan : JSON_Value);
   procedure Recover;

   function Receipt (Character_Id, Completion_Id : String) return JSON_Value;
   function Active_Receipt
     (Character_Id, Instance_Id, Kind, Step : String) return JSON_Value;
   function Snapshot_Group (Snapshot_Id : String) return JSON_Value;
   function Group_Locks (Group : JSON_Value) return JSON_Array;
   function Undo_Locks (Kind, Id, Snapshot_Id : String; Document : JSON_Value) return JSON_Array;
   function Undo_Single
     (Kind, Id, Snapshot_Id : String; Current, Restored : JSON_Value) return Boolean;
   function Undo (Group : JSON_Value; Kind, Id : String) return JSON_Value;
end Pitd_Transactions;
