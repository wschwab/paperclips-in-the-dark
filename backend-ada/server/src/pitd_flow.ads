with Ada.Strings.Unbounded;
with GNATCOLL.JSON;

package Pitd_Flow is
   pragma SPARK_Mode (Off);
   use GNATCOLL.JSON;

   procedure Load_Guidance;
   function Guidance return JSON_Value;
   function Instance_Id (Character : JSON_Value) return String;
   function Projection (Character : JSON_Value; Crew : JSON_Value := JSON_Null) return JSON_Value;
   function Validate_Request
     (Body_Value : JSON_Value; Bad : out Ada.Strings.Unbounded.Unbounded_String) return Boolean;
   function Touches_Crew (Body_Value : JSON_Value) return Boolean;

   --  Pure staging: modifies caller-owned working copies only, never persists.
   --  Durable replay precedes expected-revision/cursor checks. Changed is false
   --  on replay/failure. Caller validates final documents, stamps each changed
   --  entity once, stages participants and commits Plan after all batch items.
   function Complete
     (Character, Crew, Body_Value : JSON_Value; Expected_Revision : String;
      Plan : JSON_Value; Changed, Crew_Changed : out Boolean;
      Stored_Receipt : JSON_Value := JSON_Null) return JSON_Value;
end Pitd_Flow;
