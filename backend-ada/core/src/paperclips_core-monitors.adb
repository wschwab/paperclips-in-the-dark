pragma SPARK_Mode (On);

package body Paperclips_Core.Monitors is
   procedure Add_Stress
     (Item : in out Monitor; Requested : Natural; Applied : out Natural) is
      Old_Stress : constant Natural := Item.Stress_Value;
   begin
      if Requested <= Item.Stress_Max - Item.Stress_Value then
         Item.Stress_Value := Item.Stress_Value + Requested;
         Applied := Requested;
      else
         Applied := Item.Stress_Max - Item.Stress_Value;
         Item.Stress_Value := Item.Stress_Max;
      end if;
      --  LIFECYCLE-STRESS-001: landing at max from below raises the
      --  pending-trauma flag; never auto-adds trauma (LIFECYCLE-STRESS-002).
      if Requested > 0 and then Old_Stress < Item.Stress_Max
        and then Item.Stress_Value = Item.Stress_Max
        and then not Item.Out_Of_Action
      then
         Item.Trauma_Pending := True;
      end if;
   end Add_Stress;

   procedure Clear_Stress
     (Item : in out Monitor; Requested : Natural; Applied : out Natural) is
   begin
      if Requested <= Item.Stress_Value then
         Item.Stress_Value := Item.Stress_Value - Requested;
         Applied := Requested;
      else
         Applied := Item.Stress_Value;
         Item.Stress_Value := 0;
      end if;
   end Clear_Stress;

   procedure Resolve_Trauma
     (Item : in out Monitor; Error : out Operation_Error) is
      Old_Count : constant Natural := Item.Trauma_Count;
   begin
      if Old_Count = Item.Trauma_Max then
         Error := Duplicate;
         return;
      end if;
      Item.Trauma_Count := Old_Count + 1;
      Item.Trauma_Pending := False;
      if Item.Trauma_Count = Item.Trauma_Max then
         --  final trauma: the shared retirement cleanup runs in the SAME
         --  transition (LIFECYCLE-RETIRE-004)
         Retire (Item);
      else
         --  LIFECYCLE-TRAUMA-001: resolution keeps stress full (untouched)
         --  and marks the character out of action until end-score.  The
         --  two flags flip together (frozen invariant: stressClearPending
         --  equals isOutOfAction), so the assignment is atomic.
         Item := (Stress_Max => Item.Stress_Max,
                  Trauma_Max => Item.Trauma_Max,
                  Lesser_Slots => Item.Lesser_Slots,
                  Moderate_Slots => Item.Moderate_Slots,
                  Severe_Slots => Item.Severe_Slots,
                  Fatal_Slots => Item.Fatal_Slots,
                  Healing_Clock_Max => Item.Healing_Clock_Max,
                  Stress_Value => Item.Stress_Value,
                  Trauma_Count => Item.Trauma_Count,
                  Harm => Item.Harm,
                  Heal_Value => Item.Heal_Value,
                  Heal_Rollover => Item.Heal_Rollover,
                  Retired_Flag => Item.Retired_Flag,
                  Trauma_Pending => Item.Trauma_Pending,
                  Out_Of_Action => True,
                  Stress_Clear_Pending => True);
      end if;
      Error := No_Error;
   end Resolve_Trauma;

   procedure Remove_Trauma
     (Item : in out Monitor; Error : out Operation_Error) is
   begin
      if Item.Trauma_Count = 0 then
         Error := Duplicate;
      else
         Item.Trauma_Count := Item.Trauma_Count - 1;
         Error := No_Error;
      end if;
   end Remove_Trauma;

   procedure Add_Harm
     (Item      : in out Monitor;
      Requested : Harm_Intensity;
      Landed    : out Harm_Intensity;
      Error     : out Operation_Error) is
      Old_Fatal : constant Natural := Item.Harm (Fatal);
   begin
      if Requested = Lesser
        and then Item.Harm (Lesser) < Item.Lesser_Slots
      then
         Item.Harm (Lesser) := Item.Harm (Lesser) + 1;
         Landed := Lesser; Error := No_Error;
      elsif Requested <= Moderate
        and then Item.Harm (Moderate) < Item.Moderate_Slots
      then
         Item.Harm (Moderate) := Item.Harm (Moderate) + 1;
         Landed := Moderate; Error := No_Error;
      elsif Requested <= Severe
        and then Item.Harm (Severe) < Item.Severe_Slots
      then
         Item.Harm (Severe) := Item.Harm (Severe) + 1;
         Landed := Severe; Error := No_Error;
      elsif Item.Harm (Fatal) < Item.Fatal_Slots then
         Item.Harm (Fatal) := Item.Harm (Fatal) + 1;
         Landed := Fatal; Error := No_Error;
      else
         Landed := Fatal; Error := Slot_Full_Fatal;
      end if;
      --  LIFECYCLE-DEADISH-001: becoming deadish (fatal 0 -> 1) runs the
      --  deadish cleanup in the same transition — stress and all
      --  pending/out-of-action state cleared; ALL harm preserved (§ 7.2).
      --  The two out-of-action flags flip together (frozen invariant), so
      --  the assignment is atomic.
      if Error = No_Error and then Landed = Fatal and then Old_Fatal = 0 then
         Item := (Stress_Max => Item.Stress_Max,
                  Trauma_Max => Item.Trauma_Max,
                  Lesser_Slots => Item.Lesser_Slots,
                  Moderate_Slots => Item.Moderate_Slots,
                  Severe_Slots => Item.Severe_Slots,
                  Fatal_Slots => Item.Fatal_Slots,
                  Healing_Clock_Max => Item.Healing_Clock_Max,
                  Stress_Value => 0,
                  Trauma_Count => Item.Trauma_Count,
                  Harm => Item.Harm,
                  Heal_Value => Item.Heal_Value,
                  Heal_Rollover => Item.Heal_Rollover,
                  Retired_Flag => Item.Retired_Flag,
                  Trauma_Pending => False,
                  Out_Of_Action => False,
                  Stress_Clear_Pending => False);
      end if;
   end Add_Harm;

   procedure Remove_Harm
     (Item : in out Monitor; Intensity : Harm_Intensity;
      Error : out Operation_Error) is
   begin
      if Item.Harm (Intensity) = 0 then
         Error := Duplicate;
      else
         Item.Harm (Intensity) := Item.Harm (Intensity) - 1;
         Error := No_Error;
      end if;
   end Remove_Harm;

   procedure Progress_Healing
     (Item : in out Monitor; Segments : Natural; Applied : out Natural) is
   begin
      if Segments <= Item.Healing_Clock_Max - Item.Heal_Value then
         Item.Heal_Value := Item.Heal_Value + Segments;
         Item.Heal_Rollover := 0;
         Applied := Segments;
      else
         Applied := Item.Healing_Clock_Max - Item.Heal_Value;
         Item.Heal_Value := Item.Healing_Clock_Max;
         Item.Heal_Rollover := Segments - Applied;
      end if;
   end Progress_Healing;

   procedure Heal (Item : in out Monitor; Error : out Operation_Error) is
      Old_Rollover : constant Natural := Item.Heal_Rollover;
      Shifted      : Natural;
   begin
      if Item.Heal_Value < Item.Healing_Clock_Max then
         Error := Cannot_Heal;
         return;
      end if;
      Item.Harm (Lesser) := 0;
      Shifted := Natural'Min (Item.Harm (Moderate), Item.Lesser_Slots);
      Item.Harm (Lesser) := Shifted;
      Item.Harm (Moderate) :=
        Natural'Min (Item.Harm (Severe), Item.Moderate_Slots);
      Item.Harm (Severe) := 0;
      Item.Heal_Value := Natural'Min (Old_Rollover, Item.Healing_Clock_Max);
      if Old_Rollover > Item.Healing_Clock_Max then
         Item.Heal_Rollover := Old_Rollover - Item.Healing_Clock_Max;
      else
         Item.Heal_Rollover := 0;
      end if;
      Error := No_Error;
   end Heal;

   procedure End_Score (Item : in out Monitor) is
   begin
      --  LIFECYCLE-ENDSCORE-002: stress -> 0 and both out-of-action flags
      --  reset together (frozen invariant: stressClearPending equals
      --  isOutOfAction), so the assignment is atomic.
      Item := (Stress_Max => Item.Stress_Max,
               Trauma_Max => Item.Trauma_Max,
               Lesser_Slots => Item.Lesser_Slots,
               Moderate_Slots => Item.Moderate_Slots,
               Severe_Slots => Item.Severe_Slots,
               Fatal_Slots => Item.Fatal_Slots,
               Healing_Clock_Max => Item.Healing_Clock_Max,
               Stress_Value => 0,
               Trauma_Count => Item.Trauma_Count,
               Harm => Item.Harm,
               Heal_Value => Item.Heal_Value,
               Heal_Rollover => Item.Heal_Rollover,
               Retired_Flag => Item.Retired_Flag,
               Trauma_Pending => Item.Trauma_Pending,
               Out_Of_Action => False,
               Stress_Clear_Pending => False);
   end End_Score;

   procedure Retire (Item : in out Monitor) is
   begin
      --  shared retirement cleanup (§ 7.1): the pending/out-of-action
      --  flags flip together (frozen invariant), so the assignment is
      --  atomic.
      Item := (Stress_Max => Item.Stress_Max,
               Trauma_Max => Item.Trauma_Max,
               Lesser_Slots => Item.Lesser_Slots,
               Moderate_Slots => Item.Moderate_Slots,
               Severe_Slots => Item.Severe_Slots,
               Fatal_Slots => Item.Fatal_Slots,
               Healing_Clock_Max => Item.Healing_Clock_Max,
               Stress_Value => 0,
               Trauma_Count => Item.Trauma_Count,
               Harm => (others => 0),
               Heal_Value => 0,
               Heal_Rollover => 0,
               Retired_Flag => True,
               Trauma_Pending => False,
               Out_Of_Action => False,
               Stress_Clear_Pending => False);
   end Retire;
end Paperclips_Core.Monitors;
