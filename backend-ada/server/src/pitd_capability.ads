--  ARCH-01 rev 4: capability projection.  Extracted verbatim from
--  pitd_callback.adb (finding AR-014); no behavioral change.  Assembles the
--  capabilities DTOs (contract/openapi.yaml) from the game-derived helpers
--  in Pitd_Common — no capability literal lives here — plus the crew-claim
--  lookup shared with the claim operations.
with GNATCOLL.JSON;
with Pitd_Common;
with Pitd_Error;

package Pitd_Capability is
   pragma SPARK_Mode (Off);

   use GNATCOLL.JSON;

   --  Crew Claims: is Claim_Id a canonical claim of this crew's type?
   --  Reads Game(stem & "-crews") CrewTypes[].Claims.Nodes[].Id.  The Lair
   --  is definition-owned and is NOT claimable via claim.set.
   function Claim_Exists (E : JSON_Value; Claim_Id : String; Is_Lair : out Boolean) return Boolean;

   --  Crew Claims (A15): derived turf effect from owned claims and the
   --  compensation ledger, so clamps/manual edits cannot drift.
   function Turf_Effect_Delta (E : JSON_Value) return Integer;

   --  SC-A5: capability projections (contract/openapi.yaml
   --  ServiceCapabilities and per-entity capability maps).
   function Entity_Max_Rating (E : JSON_Value; Action : String) return Integer;
   function Has_Ability (E : JSON_Value; Name : String) return Boolean;
   function Committed_Bulk (E : JSON_Value) return Integer;
   function Upgrade_Marked (E : JSON_Value; Name : String) return Integer;
   function Ability_Taken (E : JSON_Value; Name : String) return Integer;
   function Character_Capabilities (E : JSON_Value) return JSON_Value;
   function Crew_Capabilities (E : JSON_Value) return JSON_Value;
end Pitd_Capability;
