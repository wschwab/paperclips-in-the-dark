pragma SPARK_Mode (On);

package Paperclips_Core is
   --  A boundary-valid setting size, not a game rule.  The conservative upper
   --  limit leaves room for proved sums and 2:1 fund conversion arithmetic.
   subtype Capacity is Positive range 1 .. Positive'Last / 4;
   type Operation_Error is
     (No_Error,
      Duplicate,
      Slot_Full_Fatal,
      Cannot_Heal,
      Armor_Not_Available,
      Cannot_Level_Up,
      Rating_Maxed,
      Upgrade_Maxed,
      Insufficient_Funds,
      Satchel_Full,
      Over_Bulk,
      No_Commitment,
      Commitment_Locked,
      Retired);
end Paperclips_Core;
