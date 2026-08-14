--  SC-A3: reusable typed-error construction for the whole-error
--  discriminated union (contract/schemas/operation-result.json
--  $defs/operationError).  One constructor per union code; every error
--  carries code, status (the locked HTTP status), a human-presentable
--  message, retryable, recovery, and the typed per-code details.
--  entity/preview/token accompany where the frozen branch declares them.
--  On failures the entity lives INSIDE error.entity (never at the top
--  level — "none on pure failures").  Top-level error and batch[].error
--  share this shape.  No raw exception or JSON text ever leaks into a
--  message here.
with GNATCOLL.JSON;

package Pitd_Error is
   pragma SPARK_Mode (Off);

   use GNATCOLL.JSON;

   --  Core envelope: {ok:false, applied:{op}, sideEffects:[], error:{...}}.
   --  Entity is embedded in error.entity only when it is a JSON object;
   --  Preview/token are embedded only for NORMALIZATION_REQUIRED.
   function Error_Value
     (Op, Code : String; Status : Integer; Message : String;
      Retryable : Boolean; Recovery : String; Details : JSON_Value;
      Entity : JSON_Value := JSON_Null;
      Preview : JSON_Value := JSON_Null; Token : String := "")
      return JSON_Value;

   --  Frozen details builders (common.json $defs).
   function Empty_Details return JSON_Value;
   function Pointer_Details (Issues : JSON_Array) return JSON_Value;
   function Limit_Details (Limit, Current : Integer) return JSON_Value;
   function Funds_Details (Available, Needed : Integer) return JSON_Value;
   function Stale_Details
     (Current_Revision : Integer; Current_Token : String := "")
      return JSON_Value;

   --  One frozen errorIssue record {pointer, reason, expected}.
   function Issue_At (Pointer, Reason, Expected : String) return JSON_Value;

   --  Branch constructors; one per code of the frozen union.
   function Validation_Error
     (Op, Message : String; Issues : JSON_Array;
      Entity : JSON_Value := JSON_Null) return JSON_Value;
   function Invalid_Entry_Error (Op : String; Issues : JSON_Array)
     return JSON_Value;
   function Invalid_Entity_Error (Op : String; Issues : JSON_Array)
     return JSON_Value;
   function Normalization_Required_Error
     (Op : String; Preview : JSON_Value; Warnings, Needs : JSON_Array;
      Token : String) return JSON_Value;
   function Not_Found_Error
     (Op, Message : String; Entity : JSON_Value := JSON_Null)
      return JSON_Value;
   function Stale_Error
     (Op : String; Entity : JSON_Value; Current_Revision : Integer;
      Current_Token : String := "") return JSON_Value;
   function Retired_Error (Op, Message : String; Entity : JSON_Value)
     return JSON_Value;
   function Confirm_Required_Error (Op, Message : String; Entity : JSON_Value)
     return JSON_Value;
   function Duplicate_Error (Op, Message : String; Entity : JSON_Value)
     return JSON_Value;
   function Slot_Full_Fatal_Error (Op, Message : String; Entity : JSON_Value)
     return JSON_Value;
   function Cannot_Heal_Error
     (Op, Message : String; Limit, Current : Integer; Entity : JSON_Value)
      return JSON_Value;
   function Armor_Not_Available_Error
     (Op, Message : String; Entity : JSON_Value) return JSON_Value;
   function Ability_Maxed_Error
     (Op, Message : String; Limit, Current : Integer; Entity : JSON_Value)
      return JSON_Value;
   function Cannot_Level_Up_Error
     (Op, Message : String; Limit, Current : Integer; Entity : JSON_Value)
      return JSON_Value;
   function Rating_Maxed_Error
     (Op, Message : String; Limit, Current : Integer; Entity : JSON_Value)
      return JSON_Value;
   function Upgrade_Maxed_Error
     (Op, Message : String; Limit, Current : Integer; Entity : JSON_Value)
      return JSON_Value;
   function Insufficient_Funds_Error
     (Op, Message : String; Available, Needed : Integer; Entity : JSON_Value)
      return JSON_Value;
   function Satchel_Full_Error
     (Op, Message : String; Limit, Current : Integer; Entity : JSON_Value)
      return JSON_Value;
   function Over_Bulk_Error
     (Op, Message : String; Limit, Current : Integer; Entity : JSON_Value)
      return JSON_Value;
   function No_Commitment_Error (Op, Message : String; Entity : JSON_Value)
     return JSON_Value;
   function Commitment_Locked_Error
     (Op, Message : String; Entity : JSON_Value) return JSON_Value;
   function No_History_Error (Op, Message : String; Entity : JSON_Value)
     return JSON_Value;
   function Game_Not_Found_Error (Op, Message : String) return JSON_Value;
   function Payload_Too_Large_Error
     (Op, Message : String; Limit, Current : Integer) return JSON_Value;
   function Trauma_Required_Error (Op, Message : String; Entity : JSON_Value)
     return JSON_Value;
   function Out_Of_Action_Error (Op, Message : String; Entity : JSON_Value)
     return JSON_Value;
end Pitd_Error;
