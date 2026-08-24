--  TEST-05 runtime-assertion family map (Wave-4 surgery).  Source of the
--  mapping: agent-docs/test-audit/decisions/ada-runtime.decisions.json
--  (78 rows, one per pragma Assert line; fields contractAnchor/target).
--  Every assertion below is a labeled case: its string argument NAMES the
--  guarded invariant and appears verbatim in Assert_Failure output.
--  Family -> domain contract pointer, one line per family:
--
--    bounded-clamp                   -> paperclips_core-bounded_integers.ads Add Post; PAPERCLIPS.md §5
--    stress-add-clamp (M10)          -> openapi stressAdd signed-delta clamp; paperclips_core-monitors.ads Add_Stress Post
--    stress-no-auto-trauma (M11)     -> openapi stressAdd; wave0/lifecycle-matrix.mdx LIFECYCLE-STRESS-002
--    harm-spillover-ladder           -> openapi harmAdd spillover ladder; paperclips_core-monitors.ads Add_Harm Post
--    fatal-harm-lands-fatal          -> openapi harmAdd ladder terminal landing; monitors.ads Add_Harm Post
--    harm-count-accounting           -> openapi harmRemove exact intensity, never cascades
--    deadish-on-fatal-harm           -> PAPERCLIPS.md §5.3; wave0/lifecycle-matrix.mdx LIFECYCLE-DEADISH-001
--    fund-cap-remainder              -> openapi fundGain quantity family; funds.ads Gain Post
--    fund-spend-satchel-first        -> openapi fundSpend success path (satchel first); funds.ads Spend Post
--    xp-levelup-clears-track         -> openapi attributeLevelup; experience_trackers.ads Level_Up Post
--    armor-availability-gate         -> openapi armorSet ARMOR_NOT_AVAILABLE gate; gear.ads Set_Armor_Used Pre
--    armor-unset-always-succeeds     -> openapi armorSet used=false always succeeds; gear.ads Set_Armor_Used Post
--    commitment-lock-gate            -> openapi gearSetCommitment COMMITMENT_LOCKED; gear.ads Set_Commitment Pre
--    upgrade-box-accounting          -> openapi upgradeMark/upgradeUnmark box-wise accounting; crews.ads Mark_/Unmark_Upgrade
--    project-clock-clamp             -> openapi clockProgress clamps at size; clocks.ads Progress Post
--    rollover-overflow-created (M13) -> Q24/FV-006 rollover accumulation (SC-A7); clocks.ads Progress Post
--    rollover-partial-fill           -> clocks.ads Progress Post (partial fill below size)
--    rollover-refill-after-reset     -> clocks.ads Progress Post refill
--    reset-applies-at-most-one-size  -> clock-taxonomy.mdx §10.3 (SC-A7); clocks.ads Reset Post
--    reset-drains-remainder          -> clock-taxonomy.mdx §10.3/§10.4; clocks.ads Reset Post
--    bounded-clock-clamp             -> clocks.ads Dynamic_Predicate (Project => Overflow=0); openapi clockProgress
--    project-reset-zeroes            -> clock-taxonomy.mdx §10.3/§10.4; clocks.ads Reset Post
--    lifecycle-stress flags          -> PAPERCLIPS.md §5.3; lifecycle-matrix.mdx LIFECYCLE-STRESS-001/002, §2.2 flag pairs
--    resolve-trauma family           -> PAPERCLIPS.md §5.3 TRAUMA-001; monitors.ads Resolve_Trauma Post
--    end-score family                -> PAPERCLIPS.md §5.3 ENDSCORE-002; monitors.ads End_Score Post
--    retire family                   -> PAPERCLIPS.md §5.3 RETIRE-002; monitors.ads Retire Post
--    retirement-cleanup family       -> PAPERCLIPS.md §5.3 RETIRE-004; monitors.ads Retire Post (shared cleanup)
--    trauma-remove family (M12)      -> PAPERCLIPS.md §5.3 RETIRE-008; monitors.ads Remove_Harm/Remove_Trauma Post
--    deadish family                  -> PAPERCLIPS.md §5.3 DEADISH-001/003; monitors.ads Add_Harm/Remove_Harm Post
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
   pragma Assert (Bounded_Integers.Value (B) = 5,
                  "bounded-clamp: Value saturates at Maximum");
   pragma Assert (Applied = 1,
                  "bounded-clamp: Applied reports only the applied portion");
   Monitors.Add_Stress (M, 8, Applied);
   pragma Assert (Monitors.Stress (M) = 5,
                  "stress-add-clamp (M10): overflow applies only free capacity");
   pragma Assert (Monitors.Trauma (M) = 0,
                  "stress-no-auto-trauma (M11): overflow leaves Trauma_Count 0");
   Monitors.Add_Harm (M, Monitors.Severe, Landed, Error);
   Monitors.Add_Harm (M, Monitors.Severe, Landed, Error);
   pragma Assert (Error = No_Error,
                  "harm-spillover-ladder: roll-up onto saturated slot accepted");
   pragma Assert (Landed = Monitors.Fatal,
                  "fatal-harm-lands-fatal: ladder terminal lands Fatal");
   Monitors.Remove_Harm (M, Monitors.Severe, Error);
   pragma Assert (Monitors.Harms (M) (Monitors.Fatal) = 1,
                  "harm-count-accounting: removal takes one Severe, Fatal untouched");
   Funds.Gain (F, 5, Applied, Remainder);
   pragma Assert (Applied = 4,
                  "fund-cap-remainder: Gain applies up to free capacity");
   pragma Assert (Remainder = 1,
                  "fund-cap-remainder: excess returns as Remainder");
   pragma Assert (Funds.Satchel (F) = 2,
                  "fund-cap-remainder: satchel retains the remainder");
   Funds.Spend (F, 1, Error);
   pragma Assert (Error = No_Error,
                  "fund-spend-satchel-first: spend accepted from satchel");
   pragma Assert (Funds.Satchel (F) = 1,
                  "fund-spend-satchel-first: satchel decremented by amount");
   Experience_Trackers.Add (X, 2, Applied);
   Experience_Trackers.Level_Up (X, Rating, 3, Error);
   pragma Assert (Error = No_Error,
                  "xp-levelup-clears-track: level-up accepted");
   pragma Assert (Rating = 1,
                  "xp-levelup-clears-track: rating incremented");
   pragma Assert (Experience_Trackers.Points (X) = 0,
                  "xp-levelup-clears-track: track cleared");
   Gear.Set_Armor_Used (G, Gear.Special, True, Error);
   pragma Assert (Error = Armor_Not_Available,
                  "armor-availability-gate: ARMOR_NOT_AVAILABLE without stock");
   Gear.Set_Armor_Used (G, Gear.Special, False, Error);
   pragma Assert (Error = No_Error,
                  "armor-unset-always-succeeds: used=false always accepted");
   Gear.Set_Lock (G, True);
   Gear.Set_Commitment (G, Gear.Light, 3, Error);
   pragma Assert (Error = Commitment_Locked,
                  "commitment-lock-gate: COMMITMENT_LOCKED while locked");
   Crews.Mark_Upgrade (C, Error); Crews.Mark_Upgrade (C, Error);
   Crews.Unmark_Upgrade (C, Error);
   pragma Assert (C.Upgrade_Boxes = 1,
                  "upgrade-box-accounting: mark/unmark nets boxwise");
Clocks.Progress (P, 7, Applied);
   pragma Assert (P.Segments = 4,
                  "project-clock-clamp: Segments fill exactly to Size");
   pragma Assert (P.Overflow = 0,
                  "project-clock-clamp: project clocks create no overflow");
   Clocks.Progress (R, 7, Applied); Clocks.Reset (R);
   pragma Assert (R.Segments = 3,
                  "reset-applies-at-most-one-size: reset applies carried remainder");

   --  SC-A7: Q24 accumulation — new overflow ADDS to the existing rollover
   --  (FV-006; the legacy overwrite behavior would leave rollover 1 here).
   declare
      AC : Clocks.Clock_State (4) := (Size => 4, Kind => Clocks.Rollover,
                                      Segments => 0, Overflow => 0);
   begin
      Clocks.Progress (AC, 5, Applied);          -- 4/4 r1
      pragma Assert (AC.Segments = 4,
                     "rollover-overflow-created (M13): fill reaches Size");
      pragma Assert (AC.Overflow = 1,
                     "rollover-overflow-created (M13): first carry created");
      Clocks.Progress (AC, 1, Applied);          -- 4/4 r2 (accumulation)
      pragma Assert (AC.Segments = 4,
                     "rollover-overflow-created (M13): fill pinned at Size");
      pragma Assert (AC.Overflow = 2,
                     "rollover-overflow-created (M13): new carry ADDS to existing");
      Clocks.Progress (AC, 3, Applied);          -- 4/4 r5
      pragma Assert (AC.Segments = 4,
                     "rollover-overflow-created (M13): fill pinned through chain");
      pragma Assert (AC.Overflow = 5,
                     "rollover-overflow-created (M13): cumulative carry grows");
      Clocks.Reset (AC);                         -- applies min(5,4)=4: 4/4 r1
      pragma Assert (AC.Segments = 4,
                     "reset-applies-at-most-one-size: applies min(carry, Size)");
      pragma Assert (AC.Overflow = 1,
                     "reset-drains-remainder: unapplied carry retained");
      Clocks.Reset (AC);                         -- applies min(1,4)=1: 1/4 r0
      pragma Assert (AC.Segments = 1,
                     "reset-drains-remainder: repeat reset consumes remainder");
      pragma Assert (AC.Overflow = 0,
                     "reset-drains-remainder: carry drained to zero");
   end;
   --  SC-A7: at-most-one-size reset retains the remainder (taxonomy §10.3).
   declare
      S6 : Clocks.Clock_State (6) := (Size => 6, Kind => Clocks.Rollover,
                                      Segments => 0, Overflow => 0);
   begin
      Clocks.Progress (S6, 4, Applied);           -- 4/6 r0
      pragma Assert (S6.Segments = 4,
                     "rollover-partial-fill: Segments accumulate below Size");
      pragma Assert (S6.Overflow = 0,
                     "rollover-partial-fill: no carry below Size");
      Clocks.Progress (S6, 5, Applied);          -- 6/6 r3
      pragma Assert (S6.Segments = 6,
                     "rollover-overflow-created (M13): refill reaches Size");
      pragma Assert (S6.Overflow = 3,
                     "rollover-overflow-created (M13): carry created on spill");
      Clocks.Progress (S6, 2, Applied);          -- 6/6 r5 (accumulation)
      pragma Assert (S6.Segments = 6,
                     "rollover-overflow-created (M13): fill pinned mid-chain");
      pragma Assert (S6.Overflow = 5,
                     "rollover-overflow-created (M13): carry accumulates mid-chain");
      Clocks.Reset (S6);                         -- 5/6 r0
      pragma Assert (S6.Segments = 5,
                     "reset-applies-at-most-one-size: applies whole small carry");
      pragma Assert (S6.Overflow = 0,
                     "reset-drains-remainder: carry below size fully consumed");
      Clocks.Progress (S6, 3, Applied);          -- 6/6 r2
      pragma Assert (S6.Segments = 6,
                     "rollover-refill-after-reset: refills to Size");
      pragma Assert (S6.Overflow = 2,
                     "rollover-refill-after-reset: new carry counted fresh");
      Clocks.Progress (S6, 7, Applied);          -- 6/6 r9
      pragma Assert (S6.Segments = 6,
                     "rollover-overflow-created (M13): fill pinned at Size again");
      pragma Assert (S6.Overflow = 9,
                     "rollover-overflow-created (M13): large-amount carry accumulates");
      Clocks.Reset (S6);                         -- 6/6 r3 (at most one size)
      pragma Assert (S6.Segments = 6,
                     "reset-applies-at-most-one-size: capped at one size");
      pragma Assert (S6.Overflow = 3,
                     "reset-drains-remainder: excess carry retained");
      Clocks.Reset (S6);                         -- 3/6 r0
      pragma Assert (S6.Segments = 3,
                     "reset-drains-remainder: residual carry applied next");
      pragma Assert (S6.Overflow = 0,
                     "reset-drains-remainder: carry exhausted");
   end;
   --  SC-A7: bounded clocks clamp at full and keep overflow 0.
   declare
      BC : Clocks.Clock_State (4) := (Size => 4, Kind => Clocks.Project,
                                      Segments => 0, Overflow => 0);
   begin
      Clocks.Progress (BC, 5, Applied);
      pragma Assert (BC.Segments = 4,
                     "bounded-clock-clamp: project clock clamps at Size");
      pragma Assert (BC.Overflow = 0,
                     "bounded-clock-clamp: Overflow stays 0");
      pragma Assert (Applied = 4,
                     "bounded-clock-clamp: Applied reports clamped amount");
      Clocks.Reset (BC);
      pragma Assert (BC.Segments = 0,
                     "project-reset-zeroes: reset empties Segments");
      pragma Assert (BC.Overflow = 0,
                     "project-reset-zeroes: no residue in Overflow");
   end;

   --  SC-A8 lifecycle transitions (wave0/lifecycle-matrix.mdx § 3).
   declare
      S : Monitors.Monitor (5, 2, 1, 1, 1, 1, 4);
   begin
      --  LIFECYCLE-STRESS-001: landing at max from below sets traumaPending
      --  and never auto-adds trauma (LIFECYCLE-STRESS-002).
      Monitors.Add_Stress (S, 5, Applied);
      pragma Assert (Monitors.Stress (S) = 5,
                     "LIFECYCLE-STRESS-001: stress lands at max");
      pragma Assert (Applied = 5,
                     "stress-add-exact-fill (M10): Applied equals Requested below max");
      pragma Assert (Monitors.Is_Trauma_Pending (S),
                     "LIFECYCLE-STRESS-001 (M11): landing at max sets traumaPending");
      pragma Assert (Monitors.Trauma (S) = 0,
                     "LIFECYCLE-STRESS-002 (M11): pending never auto-adds trauma");
      pragma Assert (not Monitors.Is_Retired (S),
                     "flag-isolation: stress leaves retirement untouched");
      pragma Assert (not Monitors.Is_Out_Of_Action (S),
                     "flag-isolation: stress leaves out-of-action untouched");
      pragma Assert (not Monitors.Is_Stress_Clear_Pending (S),
                     "stressClearPending-isolation: stress does not raise clearPending");
      --  LIFECYCLE-TRAUMA-001: resolution keeps stress full, clears pending,
      --  marks out-of-action and stressClearPending together.
      Monitors.Resolve_Trauma (S, Error);
      pragma Assert (Error = No_Error,
                     "resolve-trauma-accepted");
      pragma Assert (Monitors.Stress (S) = 5,
                     "resolve-keeps-stress-full");
      pragma Assert (Monitors.Trauma (S) = 1,
                     "resolve-records-trauma");
      pragma Assert (not Monitors.Is_Trauma_Pending (S),
                     "resolve-clears-pending");
      pragma Assert (Monitors.Is_Out_Of_Action (S),
                     "resolve-marks-out-of-action");
      pragma Assert (Monitors.Is_Stress_Clear_Pending (S),
                     "paired-flags: stressClearPending set with out-of-action");
      --  LIFECYCLE-ENDSCORE-002: end-score clears stress and both flags.
      Monitors.End_Score (S);
      pragma Assert (Monitors.Stress (S) = 0,
                     "endscore-clears-stress");
      pragma Assert (not Monitors.Is_Out_Of_Action (S),
                     "endscore-clears-out-of-action");
      pragma Assert (not Monitors.Is_Stress_Clear_Pending (S),
                     "endscore-clears-stressClearPending");
      pragma Assert (not Monitors.Is_Retired (S),
                     "endscore-never-retires");
      --  LIFECYCLE-RETIRE-002: explicit retirement below max trauma.
      Monitors.Retire (S);
      pragma Assert (Monitors.Is_Retired (S),
                     "explicit-retire-sets-flag");
      pragma Assert (Monitors.Trauma (S) = 1,
                     "retire-preserves-trauma-history");
      pragma Assert (Monitors.Stress (S) = 0,
                     "retire-zeroes-stress");
      pragma Assert (not Monitors.Is_Trauma_Pending (S),
                     "retire-clears-pending");
      pragma Assert (not Monitors.Is_Out_Of_Action (S),
                     "retire-clears-out-of-action");
      pragma Assert (not Monitors.Is_Stress_Clear_Pending (S),
                     "retire-clears-stressClearPending");
      --  LIFECYCLE-RETIRE-008: trauma.remove never clears isRetired.
      Monitors.Remove_Trauma (S, Error);
      pragma Assert (Error = No_Error,
                     "trauma-remove-accepted");
      pragma Assert (Monitors.Trauma (S) = 0,
                     "trauma-remove-decrements");
      pragma Assert (Monitors.Is_Retired (S),
                     "M12 retired-survives-trauma-remove");
   end;
   declare
      T : Monitors.Monitor (5, 2, 1, 1, 1, 1, 4);
   begin
      --  LIFECYCLE-RETIRE-004: resolving the max-th trauma runs the shared
      --  retirement cleanup in the same transition.
      Monitors.Add_Stress (T, 5, Applied);
      pragma Assert (Monitors.Is_Trauma_Pending (T),
                     "trauma-pending-raised");
      Monitors.Resolve_Trauma (T, Error);
      pragma Assert (Error = No_Error,
                     "resolve-trauma-accepted");
      pragma Assert (Monitors.Trauma (T) = 1,
                     "resolve-records-trauma: first");
      pragma Assert (not Monitors.Is_Retired (T),
                     "resolve-not-yet-retired");
      pragma Assert (Monitors.Is_Out_Of_Action (T),
                     "resolve-marks-out-of-action");
      Monitors.End_Score (T);
      Monitors.Add_Stress (T, 5, Applied);
      pragma Assert (Monitors.Is_Trauma_Pending (T),
                     "trauma-pending-reraised");
      Monitors.Resolve_Trauma (T, Error);
      pragma Assert (Error = No_Error,
                     "resolve-trauma-accepted");
      pragma Assert (Monitors.Trauma (T) = 2,
                     "resolve-records-trauma: second");
      pragma Assert (Monitors.Is_Retired (T),
                     "max-trauma-retires: max-th resolution retires");
      pragma Assert (Monitors.Stress (T) = 0,
                     "retirement-cleanup zeroes stress");
      pragma Assert (not Monitors.Is_Trauma_Pending (T),
                     "retirement-cleanup clears traumaPending");
      pragma Assert (not Monitors.Is_Out_Of_Action (T),
                     "retirement-cleanup clears outOfAction");
      pragma Assert (not Monitors.Is_Stress_Clear_Pending (T),
                     "retirement-cleanup clears stressClearPending");
      pragma Assert (Monitors.Harms (T) = Monitors.Harm_Counts'(others => 0),
                     "retirement-cleanup zeroes all harm counts");
      pragma Assert (Monitors.Healing_Clock (T) = 0,
                     "retirement-cleanup zeroes healing clock");
      pragma Assert (Monitors.Healing_Rollover (T) = 0,
                     "retirement-cleanup zeroes healing rollover");
   end;
   declare
      U : Monitors.Monitor (5, 2, 1, 1, 1, 1, 4);
   begin
      --  LIFECYCLE-DEADISH-001: fatal harm triggers the deadish cleanup —
      --  stress and pending state cleared, ALL harm preserved.
      Monitors.Add_Stress (U, 3, Applied);
      pragma Assert (Monitors.Stress (U) = 3,
                     "deadish-baseline-stress");
      Monitors.Add_Harm (U, Monitors.Fatal, Landed, Error);
      pragma Assert (Error = No_Error,
                     "fatal-harm-accepted");
      pragma Assert (Landed = Monitors.Fatal,
                     "fatal-harm-lands-fatal");
      pragma Assert (Monitors.Is_Deadish (U),
                     "deadish-on-fatal-harm");
      pragma Assert (Monitors.Harms (U) (Monitors.Fatal) = 1,
                     "deadish-preserves-all-harm");
      pragma Assert (Monitors.Stress (U) = 0,
                     "deadish-clears-stress");
      pragma Assert (not Monitors.Is_Trauma_Pending (U),
                     "deadish-clears-traumaPending");
      pragma Assert (not Monitors.Is_Out_Of_Action (U),
                     "deadish-clears-outOfAction");
      pragma Assert (not Monitors.Is_Stress_Clear_Pending (U),
                     "deadish-clears-stressClearPending");
      pragma Assert (not Monitors.Is_Retired (U),
                     "deadish-not-retired");
      --  LIFECYCLE-DEADISH-003: removing the fatal harm ends deadish.
      Monitors.Remove_Harm (U, Monitors.Fatal, Error);
      pragma Assert (Error = No_Error,
                     "deadish-recovery-accepted");
      pragma Assert (not Monitors.Is_Deadish (U),
                     "removing-fatal-ends-deadish");
      pragma Assert (Monitors.Harms (U) (Monitors.Fatal) = 0,
                     "remove-fatal-decrements");
   end;
end Core_Tests;
