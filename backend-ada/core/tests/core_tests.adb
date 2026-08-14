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
   F : Funds.Fund (2, 2, 2);
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

   --  SC-A7: Q24 accumulation — new overflow ADDS to the existing rollover
   --  (FV-006; the legacy overwrite behavior would leave rollover 1 here).
   declare
      AC : Clocks.Clock_State (4) := (Size => 4, Kind => Clocks.Rollover,
                                      Segments => 0, Overflow => 0);
   begin
      Clocks.Progress (AC, 5, Applied);          -- 4/4 r1
      pragma Assert (AC.Segments = 4 and AC.Overflow = 1);
      Clocks.Progress (AC, 1, Applied);          -- 4/4 r2 (accumulation)
      pragma Assert (AC.Segments = 4 and AC.Overflow = 2);
      Clocks.Progress (AC, 3, Applied);          -- 4/4 r5
      pragma Assert (AC.Segments = 4 and AC.Overflow = 5);
      Clocks.Reset (AC);                         -- applies min(5,4)=4: 4/4 r1
      pragma Assert (AC.Segments = 4 and AC.Overflow = 1);
      Clocks.Reset (AC);                         -- applies min(1,4)=1: 1/4 r0
      pragma Assert (AC.Segments = 1 and AC.Overflow = 0);
   end;
   --  SC-A7: at-most-one-size reset retains the remainder (taxonomy §10.3).
   declare
      S6 : Clocks.Clock_State (6) := (Size => 6, Kind => Clocks.Rollover,
                                      Segments => 0, Overflow => 0);
   begin
      Clocks.Progress (S6, 4, Applied);           -- 4/6 r0
      pragma Assert (S6.Segments = 4 and S6.Overflow = 0);
      Clocks.Progress (S6, 5, Applied);          -- 6/6 r3
      pragma Assert (S6.Segments = 6 and S6.Overflow = 3);
      Clocks.Progress (S6, 2, Applied);          -- 6/6 r5 (accumulation)
      pragma Assert (S6.Segments = 6 and S6.Overflow = 5);
      Clocks.Reset (S6);                         -- 5/6 r0
      pragma Assert (S6.Segments = 5 and S6.Overflow = 0);
      Clocks.Progress (S6, 3, Applied);          -- 6/6 r2
      pragma Assert (S6.Segments = 6 and S6.Overflow = 2);
      Clocks.Progress (S6, 7, Applied);          -- 6/6 r9
      pragma Assert (S6.Segments = 6 and S6.Overflow = 9);
      Clocks.Reset (S6);                         -- 6/6 r3 (at most one size)
      pragma Assert (S6.Segments = 6 and S6.Overflow = 3);
      Clocks.Reset (S6);                         -- 3/6 r0
      pragma Assert (S6.Segments = 3 and S6.Overflow = 0);
   end;
   --  SC-A7: bounded clocks clamp at full and keep overflow 0.
   declare
      BC : Clocks.Clock_State (4) := (Size => 4, Kind => Clocks.Project,
                                      Segments => 0, Overflow => 0);
   begin
      Clocks.Progress (BC, 5, Applied);
      pragma Assert (BC.Segments = 4 and BC.Overflow = 0 and Applied = 4);
      Clocks.Reset (BC);
      pragma Assert (BC.Segments = 0 and BC.Overflow = 0);
   end;

   --  SC-A8 lifecycle transitions (wave0/lifecycle-matrix.mdx § 3).
   declare
      S : Monitors.Monitor (5, 2, 1, 1, 1, 1, 4);
   begin
      --  LIFECYCLE-STRESS-001: landing at max from below sets traumaPending
      --  and never auto-adds trauma (LIFECYCLE-STRESS-002).
      Monitors.Add_Stress (S, 5, Applied);
      pragma Assert (Monitors.Stress (S) = 5 and Applied = 5);
      pragma Assert (Monitors.Is_Trauma_Pending (S));
      pragma Assert (Monitors.Trauma (S) = 0);
      pragma Assert (not Monitors.Is_Retired (S));
      pragma Assert (not Monitors.Is_Out_Of_Action (S));
      pragma Assert (not Monitors.Is_Stress_Clear_Pending (S));
      --  LIFECYCLE-TRAUMA-001: resolution keeps stress full, clears pending,
      --  marks out-of-action and stressClearPending together.
      Monitors.Resolve_Trauma (S, Error);
      pragma Assert (Error = No_Error);
      pragma Assert (Monitors.Stress (S) = 5);
      pragma Assert (Monitors.Trauma (S) = 1);
      pragma Assert (not Monitors.Is_Trauma_Pending (S));
      pragma Assert (Monitors.Is_Out_Of_Action (S));
      pragma Assert (Monitors.Is_Stress_Clear_Pending (S));
      --  LIFECYCLE-ENDSCORE-002: end-score clears stress and both flags.
      Monitors.End_Score (S);
      pragma Assert (Monitors.Stress (S) = 0);
      pragma Assert (not Monitors.Is_Out_Of_Action (S));
      pragma Assert (not Monitors.Is_Stress_Clear_Pending (S));
      pragma Assert (not Monitors.Is_Retired (S));
      --  LIFECYCLE-RETIRE-002: explicit retirement below max trauma.
      Monitors.Retire (S);
      pragma Assert (Monitors.Is_Retired (S));
      pragma Assert (Monitors.Trauma (S) = 1);
      pragma Assert (Monitors.Stress (S) = 0);
      pragma Assert (not Monitors.Is_Trauma_Pending (S));
      pragma Assert (not Monitors.Is_Out_Of_Action (S));
      pragma Assert (not Monitors.Is_Stress_Clear_Pending (S));
      --  LIFECYCLE-RETIRE-008: trauma.remove never clears isRetired.
      Monitors.Remove_Trauma (S, Error);
      pragma Assert (Error = No_Error and Monitors.Trauma (S) = 0);
      pragma Assert (Monitors.Is_Retired (S));
   end;
   declare
      T : Monitors.Monitor (5, 2, 1, 1, 1, 1, 4);
   begin
      --  LIFECYCLE-RETIRE-004: resolving the max-th trauma runs the shared
      --  retirement cleanup in the same transition.
      Monitors.Add_Stress (T, 5, Applied);
      pragma Assert (Monitors.Is_Trauma_Pending (T));
      Monitors.Resolve_Trauma (T, Error);
      pragma Assert (Error = No_Error and Monitors.Trauma (T) = 1);
      pragma Assert (not Monitors.Is_Retired (T));
      pragma Assert (Monitors.Is_Out_Of_Action (T));
      Monitors.End_Score (T);
      Monitors.Add_Stress (T, 5, Applied);
      pragma Assert (Monitors.Is_Trauma_Pending (T));
      Monitors.Resolve_Trauma (T, Error);
      pragma Assert (Error = No_Error and Monitors.Trauma (T) = 2);
      pragma Assert (Monitors.Is_Retired (T));
      pragma Assert (Monitors.Stress (T) = 0);
      pragma Assert (not Monitors.Is_Trauma_Pending (T));
      pragma Assert (not Monitors.Is_Out_Of_Action (T));
      pragma Assert (not Monitors.Is_Stress_Clear_Pending (T));
      pragma Assert (Monitors.Harms (T) = Monitors.Harm_Counts'(others => 0));
      pragma Assert (Monitors.Healing_Clock (T) = 0);
      pragma Assert (Monitors.Healing_Rollover (T) = 0);
   end;
   declare
      U : Monitors.Monitor (5, 2, 1, 1, 1, 1, 4);
   begin
      --  LIFECYCLE-DEADISH-001: fatal harm triggers the deadish cleanup —
      --  stress and pending state cleared, ALL harm preserved.
      Monitors.Add_Stress (U, 3, Applied);
      pragma Assert (Monitors.Stress (U) = 3);
      Monitors.Add_Harm (U, Monitors.Fatal, Landed, Error);
      pragma Assert (Error = No_Error and Landed = Monitors.Fatal);
      pragma Assert (Monitors.Is_Deadish (U));
      pragma Assert (Monitors.Harms (U) (Monitors.Fatal) = 1);
      pragma Assert (Monitors.Stress (U) = 0);
      pragma Assert (not Monitors.Is_Trauma_Pending (U));
      pragma Assert (not Monitors.Is_Out_Of_Action (U));
      pragma Assert (not Monitors.Is_Stress_Clear_Pending (U));
      pragma Assert (not Monitors.Is_Retired (U));
      --  LIFECYCLE-DEADISH-003: removing the fatal harm ends deadish.
      Monitors.Remove_Harm (U, Monitors.Fatal, Error);
      pragma Assert (Error = No_Error);
      pragma Assert (not Monitors.Is_Deadish (U));
      pragma Assert (Monitors.Harms (U) (Monitors.Fatal) = 0);
   end;
end Core_Tests;
