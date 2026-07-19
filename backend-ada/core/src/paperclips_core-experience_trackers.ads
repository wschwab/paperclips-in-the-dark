pragma SPARK_Mode (On);

package Paperclips_Core.Experience_Trackers is
   type Experience_Tracker (Maximum : Capacity) is private;
   function Points (Item : Experience_Tracker) return Natural;
   function Is_Full (Item : Experience_Tracker) return Boolean is
     (Points (Item) = Item.Maximum);

   procedure Add
     (Item : in out Experience_Tracker; Requested : Natural;
      Applied : out Natural)
   with Post =>
     (if Requested <= Item.Maximum - Points (Item'Old) then
          Points (Item) = Points (Item'Old) + Requested
          and Applied = Requested
      else Points (Item) = Item.Maximum
           and Applied = Item.Maximum - Points (Item'Old));

   procedure Clear (Item : in out Experience_Tracker)
     with Post => Points (Item) = 0;

   procedure Level_Up
     (Item : in out Experience_Tracker; Rating : in out Natural;
      Rating_Max : Natural; Error : out Operation_Error)
   with Pre => Rating <= Rating_Max,
        Post =>
     (if not Is_Full (Item'Old) then
          Error = Cannot_Level_Up
          and Points (Item) = Points (Item'Old) and Rating = Rating'Old
      elsif Rating'Old = Rating_Max then
          Error = Rating_Maxed
          and Points (Item) = Points (Item'Old) and Rating = Rating'Old
      else Error = No_Error and Points (Item) = 0
           and Rating = Rating'Old + 1);

private
   type Experience_Tracker (Maximum : Capacity) is record
      Point_Value : Natural := 0;
   end record
   with Dynamic_Predicate => Experience_Tracker.Point_Value <= Experience_Tracker.Maximum;
   function Points (Item : Experience_Tracker) return Natural is (Item.Point_Value);
end Paperclips_Core.Experience_Trackers;
