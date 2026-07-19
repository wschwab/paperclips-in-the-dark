pragma SPARK_Mode (On);
package Paperclips_Core.Clocks is
   type Clock_Kind is (Project, Rollover);
   type Clock_State (Size : Capacity) is record
      Kind     : Clock_Kind := Project;
      Segments : Natural := 0;
      Overflow : Natural := 0;
   end record
   with Dynamic_Predicate => Clock_State.Segments <= Clock_State.Size
     and (if Clock_State.Kind = Project then Clock_State.Overflow = 0);

   procedure Progress (Item : in out Clock_State; Amount : Natural;
                       Applied : out Natural)
   with Post => Item.Segments =
     (if Amount <= Item.Size - Item'Old.Segments
      then Item'Old.Segments + Amount else Item.Size);
   procedure Reset (Item : in out Clock_State)
   with Post => Item.Segments =
     (if Item.Kind = Project then 0 else Natural'Min (Item.Size, Item'Old.Overflow));
end Paperclips_Core.Clocks;
