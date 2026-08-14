with AWS.Response;
with AWS.Status;
with GNATCOLL.JSON;

package Pitd_Callback is
   pragma SPARK_Mode (Off);
   procedure Configure
     (Static_Directory : String;
      Data_Directory   : String;
      Games_Directory  : String;
      Test_Hooks       : Boolean);

   function Handle (Request : AWS.Status.Data) return AWS.Response.Data;

   --  SC-A1 canonicalizer (R0 matrix: docs/pages/contract/wave0/
   --  canonicalization-matrix.mdx, D1-D10/L1-L8; frozen schemas under
   --  contract/schemas/).  Pure: never writes, never repairs storage.
   --
   --  Classifies a raw stored/submitted entity document into one of the four
   --  normalizer outcomes and, when possible, produces the canonicalized
   --  document plus the ordered change list.  The import/repair preview and
   --  apply transactions (SC-A2) and stored admission (SC-A3) consume this.
   --
   --  Result object fields (JSON):
   --    outcome  "canonical" | "repairable" | "needs-input" | "unreadable"
   --    canonical  boolean (true when zero changes)
   --    document   normalized entity (absent when outcome is unreadable)
   --    changes    ordered array of {pointer, reason, previous, replacement}
   --    warnings   array of human-readable strings
   --    needsInputPointers  array of RFC 6901 pointers awaiting caller values
   --    issues     array of {pointer, reason, expected} (needs-input and
   --                unreadable details, empty for canonical/repairable)
   function Canonicalize
     (Kind, Id : String; Bytes : String) return GNATCOLL.JSON.JSON_Value;
   function Canonicalize
     (Kind, Id : String; V : GNATCOLL.JSON.JSON_Value)
      return GNATCOLL.JSON.JSON_Value;
end Pitd_Callback;
