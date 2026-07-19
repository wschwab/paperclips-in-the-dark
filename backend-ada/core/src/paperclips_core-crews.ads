pragma SPARK_Mode (On);

package Paperclips_Core.Crews is
   type Crew_State
     (Upgrade_Max, Heat_Max, Wanted_Max, Rep_Max : Capacity) is record
      Upgrade_Boxes : Natural := 0;
      Heat          : Natural := 0;
      Wanted        : Natural := 0;
      Reputation    : Natural := 0;
   end record
   with Dynamic_Predicate => Crew_State.Upgrade_Boxes <= Crew_State.Upgrade_Max
     and Crew_State.Heat <= Crew_State.Heat_Max
     and Crew_State.Wanted <= Crew_State.Wanted_Max
     and Crew_State.Reputation <= Crew_State.Rep_Max;

   procedure Mark_Upgrade (Item : in out Crew_State; Error : out Operation_Error)
   with Post =>
     (if Item'Old.Upgrade_Boxes = Item.Upgrade_Max then Error = Upgrade_Maxed
      else Error = No_Error and Item.Upgrade_Boxes = Item'Old.Upgrade_Boxes + 1);
   procedure Unmark_Upgrade (Item : in out Crew_State; Error : out Operation_Error)
   with Post =>
     (if Item'Old.Upgrade_Boxes = 0 then Error = Duplicate
      else Error = No_Error and Item.Upgrade_Boxes = Item'Old.Upgrade_Boxes - 1);
end Paperclips_Core.Crews;
