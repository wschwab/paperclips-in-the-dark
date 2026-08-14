pragma SPARK_Mode (On);

package Paperclips_Core.Monitors is
   type Harm_Intensity is (Lesser, Moderate, Severe, Fatal);
   type Harm_Counts is array (Harm_Intensity) of Natural;

   type Monitor
     (Stress_Max         : Capacity;
      Trauma_Max        : Capacity;
      Lesser_Slots      : Capacity;
      Moderate_Slots    : Capacity;
      Severe_Slots      : Capacity;
      Fatal_Slots       : Capacity;
      Healing_Clock_Max : Capacity) is private;

   function Stress (Item : Monitor) return Natural;
   function Trauma (Item : Monitor) return Natural;
   function Harms (Item : Monitor) return Harm_Counts;
   function Healing_Clock (Item : Monitor) return Natural;
   function Healing_Rollover (Item : Monitor) return Natural;
   function Harm_Capacity (Item : Monitor; Intensity : Harm_Intensity)
                      return Capacity;

   --  SC-A8 lifecycle flags (wave0/lifecycle-matrix.mdx § 2.1): isRetired
   --  is a STORED canonical flag, set only by the shared retirement cleanup
   --  and never recomputed from the trauma count (§ 11.10); isDeadish stays
   --  derived from fatal harm (write-time derivation, never a toggle);
   --  traumaPending / isOutOfAction / stressClearPending are stored with
   --  the frozen invariants (§ 2.2): pending and out-of-action never
   --  co-occur, and stressClearPending is set and cleared together with
   --  isOutOfAction.
   function Is_Retired (Item : Monitor) return Boolean;
   function Is_Deadish (Item : Monitor) return Boolean is
     (Harms (Item) (Fatal) > 0);
   function Is_Trauma_Pending (Item : Monitor) return Boolean;
   function Is_Out_Of_Action (Item : Monitor) return Boolean;
   function Is_Stress_Clear_Pending (Item : Monitor) return Boolean;

   procedure Add_Stress
     (Item : in out Monitor; Requested : Natural; Applied : out Natural)
   with Post =>
     (if Requested <= Item.Stress_Max - Stress (Item'Old) then
          Stress (Item) = Stress (Item'Old) + Requested
          and Applied = Requested
      else Stress (Item) = Item.Stress_Max
           and Applied = Item.Stress_Max - Stress (Item'Old))
     and Trauma (Item) = Trauma (Item'Old)
     and Is_Retired (Item) = Is_Retired (Item'Old)
     and Is_Deadish (Item) = Is_Deadish (Item'Old)
     --  LIFECYCLE-STRESS-001: landing at max from below (delta > 0,
     --  old < max, new = max) sets traumaPending; never auto-adds trauma
     --  (LIFECYCLE-STRESS-002), and no other transition clears or sets the
     --  flags.  The "not out of action" conjunct is semantically inert on
     --  every reachable state (out of action keeps stress full, Q42) and
     --  makes the ¬(pending ∧ out-of-action) invariant provable here.
     and Is_Trauma_Pending (Item) =
       (if Requested > 0 and then Stress (Item'Old) < Item.Stress_Max
          and then Stress (Item) = Item.Stress_Max
          and then not Is_Out_Of_Action (Item'Old)
        then True else Is_Trauma_Pending (Item'Old))
     and Is_Out_Of_Action (Item) = Is_Out_Of_Action (Item'Old)
     and Is_Stress_Clear_Pending (Item) = Is_Stress_Clear_Pending (Item'Old);

   procedure Clear_Stress
     (Item : in out Monitor; Requested : Natural; Applied : out Natural)
   with Post => Stress (Item) =
     (if Requested <= Stress (Item'Old)
      then Stress (Item'Old) - Requested else 0)
     and Is_Retired (Item) = Is_Retired (Item'Old)
     and Is_Deadish (Item) = Is_Deadish (Item'Old)
     and Is_Trauma_Pending (Item) = Is_Trauma_Pending (Item'Old)
     and Is_Out_Of_Action (Item) = Is_Out_Of_Action (Item'Old)
     and Is_Stress_Clear_Pending (Item) = Is_Stress_Clear_Pending (Item'Old);

   --  SC-A8 trauma resolution (LIFECYCLE-TRAUMA-001/002, Q42): resolution-
   --  only — the caller must have raised traumaPending by landing at max
   --  stress (the server gate is TRAUMA_REQUIRED without it).  Records the
   --  trauma by count, keeps stress FULL (untouched), clears pending, and
   --  marks the character out of action (isOutOfAction and
   --  stressClearPending together).  Resolving the max-th trauma runs the
   --  shared retirement cleanup in the same transition
   --  (LIFECYCLE-RETIRE-004): observable post-state identical to explicit
   --  retirement modulo the preserved trauma history.
   procedure Resolve_Trauma
     (Item : in out Monitor; Error : out Operation_Error)
   with Pre => Is_Trauma_Pending (Item),
     Post =>
       (if Trauma (Item'Old) = Item.Trauma_Max then
            Error = Duplicate and Trauma (Item) = Trauma (Item'Old)
            and Is_Retired (Item) = Is_Retired (Item'Old)
            and Stress (Item) = Stress (Item'Old)
            and Harms (Item) = Harms (Item'Old)
            and Is_Out_Of_Action (Item) = Is_Out_Of_Action (Item'Old)
            and Is_Stress_Clear_Pending (Item) = Is_Stress_Clear_Pending (Item'Old)
        elsif Trauma (Item'Old) + 1 = Item.Trauma_Max then
            --  final trauma: the shared retirement cleanup runs here
            Error = No_Error
            and Trauma (Item) = Item.Trauma_Max
            and Is_Retired (Item)
            and Stress (Item) = 0
            and not Is_Trauma_Pending (Item)
            and not Is_Out_Of_Action (Item)
            and not Is_Stress_Clear_Pending (Item)
and Harms (Item) = Harm_Counts'(others => 0)
            and Healing_Clock (Item) = 0
            and Healing_Rollover (Item) = 0
        else Error = No_Error
             and Trauma (Item) = Trauma (Item'Old) + 1
             and Stress (Item) = Stress (Item'Old)
             and not Is_Trauma_Pending (Item)
             and Is_Out_Of_Action (Item)
             and Is_Stress_Clear_Pending (Item)
             and Is_Retired (Item) = Is_Retired (Item'Old)
             and Harms (Item) = Harms (Item'Old)
             and Healing_Clock (Item) = Healing_Clock (Item'Old)
             and Healing_Rollover (Item) = Healing_Rollover (Item'Old));

   --  trauma.remove is the trauma-history correction path: it never
   --  recomputes or clears isRetired (LIFECYCLE-RETIRE-008) and never
   --  touches the lifecycle flags.
   procedure Remove_Trauma
     (Item : in out Monitor; Error : out Operation_Error)
   with Post =>
     (if Trauma (Item'Old) = 0 then
          Error = Duplicate and Trauma (Item) = 0
      else Error = No_Error and Trauma (Item) = Trauma (Item'Old) - 1)
     and Is_Retired (Item) = Is_Retired (Item'Old)
     and Is_Deadish (Item) = Is_Deadish (Item'Old)
     and Is_Trauma_Pending (Item) = Is_Trauma_Pending (Item'Old)
     and Is_Out_Of_Action (Item) = Is_Out_Of_Action (Item'Old)
     and Is_Stress_Clear_Pending (Item) = Is_Stress_Clear_Pending (Item'Old);

   procedure Add_Harm
     (Item      : in out Monitor;
      Requested : Harm_Intensity;
      Landed    : out Harm_Intensity;
      Error     : out Operation_Error)
   with Post =>
     (if Error = No_Error then
          Landed >= Requested
          and Harms (Item) (Landed) = Harms (Item'Old) (Landed) + 1
          and (if Landed = Fatal and then Harms (Item'Old) (Fatal) = 0 then
                   --  deadish cleanup (LIFECYCLE-DEADISH-001, § 7.2):
                   --  stress and all pending/out-of-action state cleared;
                   --  ALL harm preserved, including the fatal harm just added
                   Stress (Item) = 0
                   and not Is_Trauma_Pending (Item)
                   and not Is_Out_Of_Action (Item)
                   and not Is_Stress_Clear_Pending (Item)
               else Stress (Item) = Stress (Item'Old)
                    and Is_Trauma_Pending (Item) = Is_Trauma_Pending (Item'Old)
                    and Is_Out_Of_Action (Item) = Is_Out_Of_Action (Item'Old)
                    and Is_Stress_Clear_Pending (Item) = Is_Stress_Clear_Pending (Item'Old))
          and Is_Retired (Item) = Is_Retired (Item'Old)
      else Error = Slot_Full_Fatal
           and (for all I in Harm_Intensity range Requested .. Fatal =>
                  Harms (Item'Old) (I) = Harm_Capacity (Item, I)));

   procedure Remove_Harm
     (Item : in out Monitor; Intensity : Harm_Intensity;
      Error : out Operation_Error)
   with Post =>
     (if Harms (Item'Old) (Intensity) = 0 then
          Error = Duplicate and Harms (Item) = Harms (Item'Old)
      else Error = No_Error
           and Harms (Item) (Intensity) = Harms (Item'Old) (Intensity) - 1
           and (for all I in Harm_Intensity =>
                  (if I /= Intensity then Harms (Item) (I) = Harms (Item'Old) (I))))
     and Is_Retired (Item) = Is_Retired (Item'Old)
     and Is_Trauma_Pending (Item) = Is_Trauma_Pending (Item'Old)
     and Is_Out_Of_Action (Item) = Is_Out_Of_Action (Item'Old)
     and Is_Stress_Clear_Pending (Item) = Is_Stress_Clear_Pending (Item'Old);

   procedure Progress_Healing
     (Item : in out Monitor; Segments : Natural; Applied : out Natural)
   with Post =>
     (if Segments <= Item.Healing_Clock_Max - Healing_Clock (Item'Old) then
          Healing_Clock (Item) = Healing_Clock (Item'Old) + Segments
          and Applied = Segments
      else Healing_Clock (Item) = Item.Healing_Clock_Max
           and Applied = Item.Healing_Clock_Max - Healing_Clock (Item'Old))
     and Is_Retired (Item) = Is_Retired (Item'Old)
     and Is_Trauma_Pending (Item) = Is_Trauma_Pending (Item'Old)
     and Is_Out_Of_Action (Item) = Is_Out_Of_Action (Item'Old)
     and Is_Stress_Clear_Pending (Item) = Is_Stress_Clear_Pending (Item'Old);

   procedure Heal (Item : in out Monitor; Error : out Operation_Error)
   with Post =>
     (if Healing_Clock (Item'Old) < Item.Healing_Clock_Max then
          Error = Cannot_Heal and Harms (Item) = Harms (Item'Old)
      else Error = No_Error
           and Harms (Item) (Fatal) = Harms (Item'Old) (Fatal)
           and Harms (Item) (Severe) = 0
           and Harms (Item) (Moderate) <= Item.Moderate_Slots
           and Harms (Item) (Lesser) <= Item.Lesser_Slots)
     and Is_Retired (Item) = Is_Retired (Item'Old)
     and Is_Trauma_Pending (Item) = Is_Trauma_Pending (Item'Old)
     and Is_Out_Of_Action (Item) = Is_Out_Of_Action (Item'Old)
     and Is_Stress_Clear_Pending (Item) = Is_Stress_Clear_Pending (Item'Old);

   --  SC-A8 end-score (LIFECYCLE-ENDSCORE-002, § 4): inherent cleanup —
   --  stress → 0 and both out-of-action flags reset together.  The pending
   --  gate (TRAUMA_REQUIRED) and the optional armor/loadout cleanups live at
   --  the server boundary; this transition never touches trauma or
   --  retirement.
   procedure End_Score (Item : in out Monitor)
   with Post =>
     Stress (Item) = 0
     and not Is_Out_Of_Action (Item)
     and not Is_Stress_Clear_Pending (Item)
     and Is_Trauma_Pending (Item) = Is_Trauma_Pending (Item'Old)
     and Is_Retired (Item) = Is_Retired (Item'Old)
     and Trauma (Item) = Trauma (Item'Old)
     and Harms (Item) = Harms (Item'Old)
     and Healing_Clock (Item) = Healing_Clock (Item'Old)
     and Healing_Rollover (Item) = Healing_Rollover (Item'Old);

   --  SC-A8 shared retirement cleanup (§ 7.1) — the ONE function used by
   --  both retirement paths (explicit retire and resolving the max-th
   --  trauma): isRetired → true; stress → 0; all pending/out-of-action
   --  flags → false; all harm → cleared; healing clock and rollover → 0;
   --  trauma history (count) preserved.  In the core model armor usage is
   --  server-side JSON and is cleared by the server's equivalent cleanup.
   procedure Retire (Item : in out Monitor)
   with Post =>
     Is_Retired (Item)
     and Stress (Item) = 0
     and not Is_Trauma_Pending (Item)
     and not Is_Out_Of_Action (Item)
     and not Is_Stress_Clear_Pending (Item)
     and Harms (Item) = Harm_Counts'(others => 0)
     and Healing_Clock (Item) = 0
     and Healing_Rollover (Item) = 0
     and Trauma (Item) = Trauma (Item'Old);

private
   type Monitor
     (Stress_Max         : Capacity;
      Trauma_Max        : Capacity;
      Lesser_Slots      : Capacity;
      Moderate_Slots    : Capacity;
      Severe_Slots      : Capacity;
      Fatal_Slots       : Capacity;
      Healing_Clock_Max : Capacity) is record
      Stress_Value      : Natural := 0;
      Trauma_Count      : Natural := 0;
      Harm              : Harm_Counts := (others => 0);
      Heal_Value        : Natural := 0;
      Heal_Rollover     : Natural := 0;
      Retired_Flag      : Boolean := False;
      Trauma_Pending    : Boolean := False;
      Out_Of_Action     : Boolean := False;
      Stress_Clear_Pending : Boolean := False;
   end record
   with Dynamic_Predicate =>
     Monitor.Stress_Value <= Monitor.Stress_Max
     and Monitor.Trauma_Count <= Monitor.Trauma_Max
     and Monitor.Heal_Value <= Monitor.Healing_Clock_Max
     and Monitor.Harm (Lesser) <= Monitor.Lesser_Slots
     and Monitor.Harm (Moderate) <= Monitor.Moderate_Slots
     and Monitor.Harm (Severe) <= Monitor.Severe_Slots
     and Monitor.Harm (Fatal) <= Monitor.Fatal_Slots
     --  SC-A8 frozen invariants (lifecycle-matrix § 2.2): pending and
     --  out-of-action never co-occur; stressClearPending is set and cleared
     --  together with isOutOfAction.
     and (not (Monitor.Trauma_Pending and Monitor.Out_Of_Action))
     and (Monitor.Stress_Clear_Pending = Monitor.Out_Of_Action);

   function Is_Retired (Item : Monitor) return Boolean is (Item.Retired_Flag);
   function Is_Trauma_Pending (Item : Monitor) return Boolean is
     (Item.Trauma_Pending);
   function Is_Out_Of_Action (Item : Monitor) return Boolean is
     (Item.Out_Of_Action);
   function Is_Stress_Clear_Pending (Item : Monitor) return Boolean is
     (Item.Stress_Clear_Pending);

   function Stress (Item : Monitor) return Natural is (Item.Stress_Value);
   function Trauma (Item : Monitor) return Natural is (Item.Trauma_Count);
   function Harms (Item : Monitor) return Harm_Counts is (Item.Harm);
   function Healing_Clock (Item : Monitor) return Natural is (Item.Heal_Value);
   function Healing_Rollover (Item : Monitor) return Natural is
     (Item.Heal_Rollover);
   function Harm_Capacity (Item : Monitor; Intensity : Harm_Intensity)
                      return Capacity is
     (case Intensity is
         when Lesser   => Item.Lesser_Slots,
         when Moderate => Item.Moderate_Slots,
         when Severe   => Item.Severe_Slots,
         when Fatal    => Item.Fatal_Slots);
end Paperclips_Core.Monitors;
