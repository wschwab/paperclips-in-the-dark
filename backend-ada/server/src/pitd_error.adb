--  SC-A3: body of the reusable typed-error package.  Every branch
--  constructor pins the frozen union's locked status, retryable flag,
--  recovery instruction, and detail shape (operation-result.json
--  $defs/operationError + common.json $defs).  Messages are short human
--  strings; no document bytes or exception text ever enter them.
package body Pitd_Error is
   function Error_Value
     (Op, Code : String; Status : Integer; Message : String;
      Retryable : Boolean; Recovery : String; Details : JSON_Value;
      Entity : JSON_Value := JSON_Null;
      Preview : JSON_Value := JSON_Null; Token : String := "")
      return JSON_Value
   is
      R : JSON_Value := Create_Object;
      A : JSON_Value := Create_Object;
      E : JSON_Value := Create_Object;
   begin
      Set_Field (A, "op", Op);
      Set_Field (E, "code", Code);
      Set_Field (E, "status", Status);
      Set_Field (E, "message", Message);
      Set_Field (E, "retryable", Retryable);
      Set_Field (E, "recovery", Recovery);
      Set_Field (E, "details", Details);
      if Entity.Kind = JSON_Object_Type then
         Set_Field (E, "entity", Clone (Entity));
      end if;
      if Preview.Kind = JSON_Object_Type then
         Set_Field (E, "preview", Clone (Preview));
      end if;
      if Token /= "" then
         Set_Field (E, "token", Token);
      end if;
      Set_Field (R, "ok", False);
      Set_Field (R, "applied", A);
      Set_Field (R, "sideEffects", Empty_Array);
      Set_Field (R, "error", E);
      return R;
   end Error_Value;

   function Empty_Details return JSON_Value is
     (Create_Object);

   function Pointer_Details (Issues : JSON_Array) return JSON_Value is
      D : JSON_Value := Create_Object;
   begin
      Set_Field (D, "issues", Issues);
      return D;
   end Pointer_Details;

   function Limit_Details (Limit, Current : Integer) return JSON_Value is
      D : JSON_Value := Create_Object;
   begin
      Set_Field (D, "limit", Limit);
      Set_Field (D, "current", Current);
      return D;
   end Limit_Details;

   function Funds_Details (Available, Needed : Integer) return JSON_Value is
      D : JSON_Value := Create_Object;
   begin
      Set_Field (D, "available", Available);
      Set_Field (D, "needed", Needed);
      return D;
   end Funds_Details;

   function Stale_Details
     (Current_Revision : Integer; Current_Token : String := "")
      return JSON_Value
   is
      D : JSON_Value := Create_Object;
   begin
      if Current_Token /= "" then
         Set_Field (D, "currentContentToken", Current_Token);
      else
         Set_Field (D, "currentRevision", Current_Revision);
      end if;
      return D;
   end Stale_Details;

   function Issue_At (Pointer, Reason, Expected : String) return JSON_Value is
      X : JSON_Value := Create_Object;
   begin
      Set_Field (X, "pointer", Pointer);
      Set_Field (X, "reason", Reason);
      Set_Field (X, "expected", Expected);
      return X;
   end Issue_At;

   function Validation_Error
     (Op, Message : String; Issues : JSON_Array;
      Entity : JSON_Value := JSON_Null) return JSON_Value
   is
   begin
      return Error_Value
        (Op, "VALIDATION", 400, Message, True,
         "Fix the request per the listed issues and retry.",
         Pointer_Details (Issues), Entity);
   end Validation_Error;

   function Invalid_Entry_Error (Op : String; Issues : JSON_Array)
     return JSON_Value
   is
   begin
      return Error_Value
        (Op, "INVALID_ENTRY", 400,
         "submitted content cannot be normalized with the supplied values",
         True,
         "Supply the missing values for the listed pointers, preview again, and confirm the new preview.",
         Pointer_Details (Issues));
   end Invalid_Entry_Error;

   function Invalid_Entity_Error (Op : String; Issues : JSON_Array)
     return JSON_Value
   is
   begin
      return Error_Value
        (Op, "INVALID_ENTITY", 422, "stored entity is degraded", False,
         "Repair the entity (repair-preview, then a confirmed repair apply) before mutating it.",
         Pointer_Details (Issues));
   end Invalid_Entity_Error;

   function Normalization_Required_Error
     (Op : String; Preview : JSON_Value; Warnings, Needs : JSON_Array;
      Token : String) return JSON_Value
   is
      D : JSON_Value := Create_Object;
   begin
      Set_Field (D, "warnings", Warnings);
      if Length (Needs) > 0 then Set_Field (D, "needsInputPointers", Needs); end if;
      Set_Field (D, "previewToken", Token);
      return Error_Value
        (Op, "NORMALIZATION_REQUIRED", 409,
         "normalization preview requires confirmation before any write",
         True,
         "Confirm the preview: repeat the request with the preview token and confirm:true; nothing was written.",
         D, JSON_Null, Preview, Token);
   end Normalization_Required_Error;

   function Not_Found_Error
     (Op, Message : String; Entity : JSON_Value := JSON_Null)
      return JSON_Value
   is
   begin
      return Error_Value
        (Op, "NOT_FOUND", 404, Message, False,
         "Check the target id and retry.", Empty_Details, Entity);
   end Not_Found_Error;

   function Stale_Error
     (Op : String; Entity : JSON_Value; Current_Revision : Integer;
      Current_Token : String := "") return JSON_Value
   is
   begin
      return Error_Value
        (Op, "STALE_REVISION", 409,
         "the stored entity changed since the request was prepared", True,
         "Re-read the current entity and repeat the operation against its current version.",
         Stale_Details (Current_Revision, Current_Token), Entity);
   end Stale_Error;

   function Retired_Error (Op, Message : String; Entity : JSON_Value)
     return JSON_Value
   is
   begin
      return Error_Value
        (Op, "RETIRED", 200, Message, False,
         "The character is retired; undo or import/repair can restore it.",
         Empty_Details, Entity);
   end Retired_Error;

   function Confirm_Required_Error (Op, Message : String; Entity : JSON_Value)
     return JSON_Value
   is
   begin
      return Error_Value
        (Op, "CONFIRM_REQUIRED", 200, Message, True,
         "Repeat the request with confirm:true.", Empty_Details, Entity);
   end Confirm_Required_Error;

   function Duplicate_Error (Op, Message : String; Entity : JSON_Value)
     return JSON_Value
   is
   begin
      return Error_Value
        (Op, "DUPLICATE", 200, Message, True,
         "The entry already exists; choose a different value or remove the existing one.",
         Empty_Details, Entity);
   end Duplicate_Error;

   function Slot_Full_Fatal_Error (Op, Message : String; Entity : JSON_Value)
     return JSON_Value
   is
   begin
      return Error_Value
        (Op, "SLOT_FULL_FATAL", 200, Message, False,
         "Remove harm at the requested intensity or higher before adding more.",
         Empty_Details, Entity);
   end Slot_Full_Fatal_Error;

   function Cannot_Heal_Error
     (Op, Message : String; Limit, Current : Integer; Entity : JSON_Value)
      return JSON_Value
   is
   begin
      return Error_Value
        (Op, "CANNOT_HEAL", 200, Message, True,
         "Fill the healing clock (harm.healing-clock) before healing.",
         Limit_Details (Limit, Current), Entity);
   end Cannot_Heal_Error;

   function Armor_Not_Available_Error
     (Op, Message : String; Entity : JSON_Value) return JSON_Value
   is
   begin
      return Error_Value
        (Op, "ARMOR_NOT_AVAILABLE", 200, Message, True,
         "Commit the armor to the loadout (or take an ability granting it) before using it.",
         Empty_Details, Entity);
   end Armor_Not_Available_Error;

   function Ability_Maxed_Error
     (Op, Message : String; Limit, Current : Integer; Entity : JSON_Value)
      return JSON_Value
   is
   begin
      return Error_Value
        (Op, "ABILITY_MAXED", 200, Message, False,
         "The ability is at its take limit; no more times can be taken.",
         Limit_Details (Limit, Current), Entity);
   end Ability_Maxed_Error;

   function Cannot_Level_Up_Error
     (Op, Message : String; Limit, Current : Integer; Entity : JSON_Value)
      return JSON_Value
   is
   begin
      return Error_Value
        (Op, "CANNOT_LEVEL_UP", 200, Message, True,
         "Fill the attribute XP track before leveling up.",
         Limit_Details (Limit, Current), Entity);
   end Cannot_Level_Up_Error;

   function Rating_Maxed_Error
     (Op, Message : String; Limit, Current : Integer; Entity : JSON_Value)
      return JSON_Value
   is
   begin
      return Error_Value
        (Op, "RATING_MAXED", 200, Message, False,
         "The action rating is at its effective cap; lower the requested rating.",
         Limit_Details (Limit, Current), Entity);
   end Rating_Maxed_Error;

   function Upgrade_Maxed_Error
     (Op, Message : String; Limit, Current : Integer; Entity : JSON_Value)
      return JSON_Value
   is
   begin
      return Error_Value
        (Op, "UPGRADE_MAXED", 200, Message, False,
         "The upgrade is at its total box count; no more boxes can be marked.",
         Limit_Details (Limit, Current), Entity);
   end Upgrade_Maxed_Error;

   function Insufficient_Funds_Error
     (Op, Message : String; Available, Needed : Integer; Entity : JSON_Value)
      return JSON_Value
   is
   begin
      return Error_Value
        (Op, "INSUFFICIENT_FUNDS", 200, Message, True,
         "Earn or liquidate more coins before spending that amount.",
         Funds_Details (Available, Needed), Entity);
   end Insufficient_Funds_Error;

   function Satchel_Full_Error
     (Op, Message : String; Limit, Current : Integer; Entity : JSON_Value)
      return JSON_Value
   is
   begin
      return Error_Value
        (Op, "SATCHEL_FULL", 200, Message, False,
         "Spend or stash coins before liquidating more into the satchel.",
         Limit_Details (Limit, Current), Entity);
   end Satchel_Full_Error;

   function Over_Bulk_Error
     (Op, Message : String; Limit, Current : Integer; Entity : JSON_Value)
      return JSON_Value
   is
   begin
      return Error_Value
        (Op, "OVER_BULK", 200, Message, False,
         "Commit a lighter loadout or raise the commitment before adding that item.",
         Limit_Details (Limit, Current), Entity);
   end Over_Bulk_Error;

   function No_Commitment_Error (Op, Message : String; Entity : JSON_Value)
     return JSON_Value
   is
   begin
      return Error_Value
        (Op, "NO_COMMITMENT", 200, Message, False,
         "Set a commitment (gear.set-commitment) before committing items.",
         Empty_Details, Entity);
   end No_Commitment_Error;

   function Commitment_Locked_Error
     (Op, Message : String; Entity : JSON_Value) return JSON_Value
   is
   begin
      return Error_Value
        (Op, "COMMITMENT_LOCKED", 200, Message, False,
         "Unlock the commitment (gear.unlock) before changing it.",
         Empty_Details, Entity);
   end Commitment_Locked_Error;

   function No_History_Error (Op, Message : String; Entity : JSON_Value)
     return JSON_Value
   is
   begin
      return Error_Value
        (Op, "NO_HISTORY", 200, Message, False,
         "The entity has no snapshots; undo is unavailable.",
         Empty_Details, Entity);
   end No_History_Error;

   function Game_Not_Found_Error (Op, Message : String) return JSON_Value
   is
   begin
      return Error_Value
        (Op, "GAME_NOT_FOUND", 200, Message, True,
         "Create against an installed game stem (see the games index).",
         Empty_Details);
   end Game_Not_Found_Error;

   function Payload_Too_Large_Error
     (Op, Message : String; Limit, Current : Integer) return JSON_Value
   is
   begin
      return Error_Value
        (Op, "PAYLOAD_TOO_LARGE", 413, Message, False,
         "Reduce the payload below the byte cap and retry.",
         Limit_Details (Limit, Current));
   end Payload_Too_Large_Error;

   function Trauma_Required_Error (Op, Message : String; Entity : JSON_Value)
     return JSON_Value
   is
   begin
      return Error_Value
        (Op, "TRAUMA_REQUIRED", 200, Message, True,
         "Resolve the pending trauma (trauma.add) or run end-score before this operation.",
         Empty_Details, Entity);
   end Trauma_Required_Error;

   function Out_Of_Action_Error (Op, Message : String; Entity : JSON_Value)
     return JSON_Value
   is
   begin
      return Error_Value
        (Op, "OUT_OF_ACTION", 200, Message, False,
         "The character is out of action; run end-score to release it.",
         Empty_Details, Entity);
   end Out_Of_Action_Error;
end Pitd_Error;
