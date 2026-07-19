pragma SPARK_Mode (On);
package body Paperclips_Core.Clocks is
   procedure Progress (Item : in out Clock_State; Amount : Natural;
                       Applied : out Natural) is
   begin
      if Amount <= Item.Size - Item.Segments then
         Item.Segments := Item.Segments + Amount; Applied := Amount;
         if Item.Kind = Rollover then Item.Overflow := 0; end if;
      else
         Applied := Item.Size - Item.Segments;
         if Item.Kind = Rollover then Item.Overflow := Amount - Applied; end if;
         Item.Segments := Item.Size;
      end if;
   end Progress;
   procedure Reset (Item : in out Clock_State) is
      Old_Overflow : constant Natural := Item.Overflow;
   begin
      if Item.Kind = Project then Item.Segments := 0; Item.Overflow := 0;
      else
         Item.Segments := Natural'Min (Item.Size, Old_Overflow);
         if Old_Overflow > Item.Size then Item.Overflow := Old_Overflow - Item.Size;
         else Item.Overflow := 0; end if;
      end if;
   end Reset;
end Paperclips_Core.Clocks;
