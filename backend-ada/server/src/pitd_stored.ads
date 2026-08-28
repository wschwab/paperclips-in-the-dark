--  ARCH-01 rev 1: stored-entity classification.  Extracted verbatim from
--  pitd_callback.adb (finding AR-014); no behavioral change.  This is the
--  ONE classification path (R0 matrix — canonical / repairable / needs-input
--  / unreadable) shared by direct GET, history reads, mutations, batch,
--  capabilities, and every collection projection.
with GNATCOLL.JSON;

package Pitd_Stored is
   pragma SPARK_Mode (Off);

   use GNATCOLL.JSON;

   --  SC-A3: the ONE stored-entity classification path.  E is the raw
   --  parsed entity (JSON_Null for unreadable), Ctx the normalizer context,
   --  Issues the pointer-level admission details, and Canonical whether the
   --  stored bytes admit without repair.  Purely read-only: never writes,
   --  never repairs.
   procedure Classify_Stored
     (Kind, Id : String; Bytes : String;
      E : out JSON_Value; Ctx : out JSON_Value;
      Issues : out JSON_Array; Canonical : out Boolean);

   --  True when the document validates against the generated schema
   --  validator AND matches the route identity (Q15: the route is
   --  authoritative; a stored body whose kind/id contradicts its directory
   --  location is a D8 identity defect, never silently accepted).
   function Entity_Is_Canonical (Kind, Id : String; V : JSON_Value) return Boolean;

   --  Pointer-level issues (frozen errorIssue shape) for the current
   --  validator error set; identity defects are prepended when the body
   --  contradicts the route.
   function Validation_Issues (Kind, Id : String; V : JSON_Value) return JSON_Array;

   --  Single schema-validation entry for write paths (post-create and
   --  post-mutation checks in the route glue).
   procedure Schema_Check (Kind : String; V : JSON_Value; Ok : out Boolean);
   --  SC-A3: pointer-level admission issues for a non-canonical stored
   --  document: the normalizer's needs-input issues first, then one issue
   --  per change-list entry whose pointer is not already reported.
   function Admission_Issues
     (Kind, Id : String; E : JSON_Value; Ctx : JSON_Value) return JSON_Array;
end Pitd_Stored;
