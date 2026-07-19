pragma SPARK_Mode (On);

package body Paperclips_Core.Experience_Trackers is
   procedure Add
     (Item : in out Experience_Tracker; Requested : Natural;
      Applied : out Natural) is
   begin
      if Requested <= Item.Maximum - Item.Point_Value then
         Item.Point_Value := Item.Point_Value + Requested;
         Applied := Requested;
      else
         Applied := Item.Maximum - Item.Point_Value;
         Item.Point_Value := Item.Maximum;
      end if;
   end Add;

   procedure Clear (Item : in out Experience_Tracker) is
   begin
      if Item.Point_Value /= 0 then
         Item.Point_Value := 0;
      end if;
   end Clear;

   procedure Level_Up
     (Item : in out Experience_Tracker; Rating : in out Natural;
      Rating_Max : Natural; Error : out Operation_Error) is
   begin
      if Item.Point_Value < Item.Maximum then
         Error := Cannot_Level_Up;
      elsif Rating = Rating_Max then
         Error := Rating_Maxed;
      else
         Rating := Rating + 1;
         Item.Point_Value := 0;
         Error := No_Error;
      end if;
   end Level_Up;
end Paperclips_Core.Experience_Trackers;
