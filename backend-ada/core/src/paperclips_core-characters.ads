pragma SPARK_Mode (On);
with Paperclips_Core.Gear;
with Paperclips_Core.Monitors;

package Paperclips_Core.Characters is
   type Character_State
     (Stress_Max, Trauma_Max, Lesser_Slots, Moderate_Slots, Severe_Slots,
      Fatal_Slots, Healing_Max, Bulk_Max : Capacity) is record
      Monitor : Monitors.Monitor
        (Stress_Max, Trauma_Max, Lesser_Slots, Moderate_Slots, Severe_Slots,
         Fatal_Slots, Healing_Max);
      Loadout : Gear.Gear_State (Bulk_Max);
   end record;

   function Is_Retired (Item : Character_State) return Boolean is
     (Monitors.Is_Retired (Item.Monitor));
   function Is_Deadish (Item : Character_State) return Boolean is
     (Monitors.Is_Deadish (Item.Monitor));
   function Mutation_Allowed
     (Item : Character_State; Is_Trauma_Edit : Boolean) return Boolean is
     (not Is_Retired (Item) or Is_Trauma_Edit);
end Paperclips_Core.Characters;
