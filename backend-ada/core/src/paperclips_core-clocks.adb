pragma SPARK_Mode (On);
package body Paperclips_Core.Clocks is
   procedure Progress (Item : in out Clock_State; Amount : Natural;
                       Applied : out Natural) is
   begin
      if Amount <= Item.Size - Item.Segments then
         Item.Segments := Item.Segments + Amount;
         Applied := Amount;
         if Item.Kind = Project then Item.Overflow := 0; end if;
      else
         Applied := Item.Size - Item.Segments;
         Item.Segments := Item.Size;
         if Item.Kind = Rollover then
            --  Q24 accumulation: new overflow ADDS to the existing rollover
            --  instead of overwriting it (FV-006).
            Item.Overflow := Item.Overflow + (Amount - Applied);
         else
            Item.Overflow := 0;
         end if;
      end if;
   end Progress;

   procedure Reset (Item : in out Clock_State) is
      Old_Overflow : constant Natural := Item.Overflow;
   begin
      if Item.Kind = Project then
         Item.Segments := 0;
         Item.Overflow := 0;
      elsif Old_Overflow > Item.Size then
         --  at most one clock size of carried overflow is applied; the
         --  remainder is retained (Q24; matches RolloverClock.Reset).
         Item.Segments := Item.Size;
         Item.Overflow := Old_Overflow - Item.Size;
      else
         Item.Overflow := 0;
         Item.Segments := Old_Overflow;
      end if;
   end Reset;
end Paperclips_Core.Clocks;
