--  ARCH-01 rev 3: collection summary projection.  Extracted verbatim from
--  pitd_callback.adb (finding AR-014); no behavioral change.  The ONE
--  summary-row projection per kind shared by the roster, list endpoints,
--  and the members endpoint, plus the response-time completeness derivation
--  (SC-W4) and the total-collection degraded rows (E11).
--
--  History metadata (canUndo/historyCount) flows exclusively through the
--  single canonical path Pitd_Common.History_Count — never stored, never
--  recomputed per caller.
with Ada.Directories;
with Ada.Strings.UTF_Encoding.Wide_Wide_Strings;
with GNATCOLL.JSON;
with Pitd_Common;
with Pitd_Stored;

package Pitd_Summary is
   pragma SPARK_Mode (Off);

   use GNATCOLL.JSON;

   --  Declared summaries (BUG-012).
   function Character_Summary (C : JSON_Value) return JSON_Value;
   function Crew_Summary (C : JSON_Value; All_Chars : JSON_Array) return JSON_Value;
   function Clock_Summary (C : JSON_Value) return JSON_Value;

   --  SC-A4: degraded rows keep the same summary schema as valid rows with
   --  canonical empties (total-collection rule E11 + R0 matrix D9/D10).
   function Degraded_Row
     (Kind, Id : String; Bytes : String; Repairable : Boolean) return JSON_Value;
   function Degraded_Clock_Row
     (Id, Bytes : String; Repairable : Boolean) return JSON_Value;

   --  SC-W4: completeness derivation (contract x-requiredWhenComplete),
   --  computed at response time with the nonBlankString predicate.
   function Character_Is_Complete (E : JSON_Value) return Boolean;
   function Crew_Is_Complete (E : JSON_Value) return Boolean;

   --  SC-A4: the ONE row projection per kind (every directory route is
   --  listed, Q15; one unreadable member never removes valid rows).
   function Character_Rows return JSON_Array;
   function Crew_Rows (CC : JSON_Array) return JSON_Array;
   function Clock_Rows return JSON_Array;

   --  SC-A3/SC-A4: the roster projection over the stored-entity
   --  classification path.
   function Roster_Value return JSON_Value;
end Pitd_Summary;
