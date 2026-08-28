--  ARCH-01 rev 5: operation routing.  Extracted verbatim from
--  pitd_callback.adb (finding AR-014); no behavioral change.  Request-shape
--  validation, the operation router (Mutate), entity creation templates,
--  revision stamping, snapshot-worthiness, core clamps, and clock
--  reference validation.  Every numeric bound comes from the validated
--  game-settings cache (Pitd_Common); claim lookups come from
--  Pitd_Capability.
with Ada.Strings.Unbounded;
with GNATCOLL.JSON;
with Pitd_Capability;
with Pitd_Common;
with Pitd_Error;

package Pitd_Ops is
   pragma SPARK_Mode (Off);

   use Ada.Strings.Unbounded;
   use GNATCOLL.JSON;

   --  CONTRACT-02 (DEC-02 ruling, 2026-08-24): the typed sideEffect emitted
   --  by the amount-based stress.clear op when the requested amount exceeded
   --  the marked stress and Stress landed at 0.  Frozen vocabulary: clients
   --  match this exact string to render the SRD Overindulgence notice.
   OVERINDULGED_SIDEEFFECT : constant String :=
     "overindulged — indulgence exceeded remaining stress";

   --  BUG-008: op -> snapshot-worthy predicate (x-snapshot flags mirror
   --  contract/openapi.yaml).
   function Snapshots (Op : String) return Boolean;

   --  Bounded-integer clamps (Paperclips_Core.Bounded_Integers wrappers).
   procedure Core_Clamp_Add
     (Current, Maximum, Amount : Natural; New_Value, Applied : out Natural);
   procedure Core_Clamp_Subtract
     (Current, Maximum, Amount : Natural; New_Value, Applied : out Natural);

   --  Creation templates (SC-A6: settings-derived, no game-domain literal).
   function New_Character (Stem, Playbook : String) return JSON_Value;
   function New_Crew (Stem, Crew_Type : String) return JSON_Value;
   function New_Clock (B : JSON_Value) return JSON_Value;

   --  Revision bump + updatedAt stamp on every mutation.
   procedure Stamp (E : JSON_Value);

   --  Request-shape validation per kind/op (frozen allowed-field sets).
   --  Returns False with Bad naming the first offending field.  Called
   --  BEFORE any mutation so invalid requests mutate nothing.
   function Validate_Request
     (Kind, Op : String; B : JSON_Value; Bad : out Unbounded_String) return Boolean;

   --  The ONE operation router: dispatches every entity op against E with
   --  args B, returning the frozen operation-result envelope.
   function Mutate (Kind, Op : String; E, B : JSON_Value) return JSON_Value;

   --  SC-A7: clock ownership and relationship reference validation for
   --  create/update (store-accessing, so it runs in the route layer's
   --  transaction scope).  Returns False with Bad naming the defect.
   function Check_Clock_Refs
     (B : JSON_Value; Self_Id : String; Bad : out Unbounded_String) return Boolean;
end Pitd_Ops;
