with Paperclips_Core;
with Paperclips_Core.Bounded_Integers;
with Paperclips_Core.Clocks;
with Paperclips_Core.Crews;
with Paperclips_Core.Experience_Trackers;
with Paperclips_Core.Funds;
with Paperclips_Core.Gear;
with Paperclips_Core.Monitors;

procedure Core_Tests is
   use Paperclips_Core;
   use type Paperclips_Core.Monitors.Harm_Counts;
   use type Paperclips_Core.Monitors.Harm_Intensity;
   B : Bounded_Integers.Bounded_Integer := Bounded_Integers.Create (5, 4);
   M : Monitors.Monitor (5, 2, 1, 1, 1, 1, 4);
   F : Funds.Fund (2, 2);
   X : Experience_Trackers.Experience_Tracker (2);
   G : Gear.Gear_State (6);
   C : Crews.Crew_State (2, 9, 4, 12);
   P : Clocks.Clock_State (4);
   R : Clocks.Clock_State (4) := (Size => 4, Kind => Clocks.Rollover,
                                  Segments => 0, Overflow => 0);
   Applied, Remainder, Rating : Natural := 0;
   Error : Operation_Error;
   Landed : Monitors.Harm_Intensity;
begin
   Bounded_Integers.Add (B, 3, Applied);
   pragma Assert (Bounded_Integers.Value (B) = 5 and Applied = 1);
   Monitors.Add_Stress (M, 8, Applied);
   pragma Assert (Monitors.Stress (M) = 5 and Monitors.Trauma (M) = 0);
   Monitors.Add_Harm (M, Monitors.Severe, Landed, Error);
   Monitors.Add_Harm (M, Monitors.Severe, Landed, Error);
   pragma Assert (Error = No_Error and Landed = Monitors.Fatal);
   Monitors.Remove_Harm (M, Monitors.Severe, Error);
   pragma Assert (Monitors.Harms (M) (Monitors.Fatal) = 1);
   Funds.Gain (F, 5, Applied, Remainder);
   pragma Assert (Applied = 4 and Remainder = 1 and Funds.Satchel (F) = 2);
   Funds.Spend (F, 1, Error);
   pragma Assert (Error = No_Error and Funds.Satchel (F) = 1);
   Experience_Trackers.Add (X, 2, Applied);
   Experience_Trackers.Level_Up (X, Rating, 3, Error);
   pragma Assert (Error = No_Error and Rating = 1
                  and Experience_Trackers.Points (X) = 0);
   Gear.Set_Armor_Used (G, Gear.Special, True, Error);
   pragma Assert (Error = Armor_Not_Available);
   Gear.Set_Armor_Used (G, Gear.Special, False, Error);
   pragma Assert (Error = No_Error);
   Gear.Set_Lock (G, True);
   Gear.Set_Commitment (G, Gear.Light, 3, Error);
   pragma Assert (Error = Commitment_Locked);
   Crews.Mark_Upgrade (C, Error); Crews.Mark_Upgrade (C, Error);
   Crews.Unmark_Upgrade (C, Error);
   pragma Assert (C.Upgrade_Boxes = 1);
   Clocks.Progress (P, 7, Applied);
   pragma Assert (P.Segments = 4 and P.Overflow = 0);
   Clocks.Progress (R, 7, Applied); Clocks.Reset (R);
   pragma Assert (R.Segments = 3);
end Core_Tests;
