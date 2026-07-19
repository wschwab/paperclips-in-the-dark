pragma SPARK_Mode (On);
package body Paperclips_Core.Crews is
   procedure Mark_Upgrade (Item : in out Crew_State; Error : out Operation_Error) is
   begin
      if Item.Upgrade_Boxes = Item.Upgrade_Max then Error := Upgrade_Maxed;
      else Item.Upgrade_Boxes := Item.Upgrade_Boxes + 1; Error := No_Error; end if;
   end Mark_Upgrade;
   procedure Unmark_Upgrade (Item : in out Crew_State; Error : out Operation_Error) is
   begin
      if Item.Upgrade_Boxes = 0 then Error := Duplicate;
      else Item.Upgrade_Boxes := Item.Upgrade_Boxes - 1; Error := No_Error; end if;
   end Unmark_Upgrade;
end Paperclips_Core.Crews;
