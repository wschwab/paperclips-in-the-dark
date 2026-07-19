pragma SPARK_Mode (On);

package body Paperclips_Core.Monitors is
   procedure Add_Stress
     (Item : in out Monitor; Requested : Natural; Applied : out Natural) is
   begin
      if Requested <= Item.Stress_Max - Item.Stress_Value then
         Item.Stress_Value := Item.Stress_Value + Requested;
         Applied := Requested;
      else
         Applied := Item.Stress_Max - Item.Stress_Value;
         Item.Stress_Value := Item.Stress_Max;
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

   procedure Add_Trauma (Item : in out Monitor; Error : out Operation_Error) is
   begin
      if Item.Trauma_Count = Item.Trauma_Max then
         Error := Duplicate;
      else
         Item.Trauma_Count := Item.Trauma_Count + 1;
         Error := No_Error;
      end if;
   end Add_Trauma;

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
end Paperclips_Core.Monitors;
