pragma SPARK_Mode (On);
package Paperclips_Core.Clocks is
   type Clock_Kind is (Project, Rollover);
   type Clock_State (Size : Capacity) is record
      Kind     : Clock_Kind := Project;
      Segments : Natural := 0;
      Overflow : Natural := 0;
   end record
   with Dynamic_Predicate => Clock_State.Segments <= Clock_State.Size
     and (if Clock_State.Kind = Project then Clock_State.Overflow = 0)
     and (if Clock_State.Kind = Rollover and Clock_State.Overflow > 0
          then Clock_State.Segments = Clock_State.Size);

   --  SC-O5 frozen contract (clock-taxonomy.mdx §10.4, Q24): progress ADDS
   --  new overflow to the existing rollover instead of overwriting it
   --  (FV-006).  The body still implements the legacy overwrite behavior;
   --  the accumulation Post is intentionally unprovable until SC-A7
   --  implements the contract.  The signed (tug-of-war) delta path is a
   --  wire-level concern of the API; this core primitive keeps the
   --  server-compatible Natural signature and states the positive rule.
   --  SC-A7 additionally implements, at the API boundary, the signed path
   --  declared by the frozen contract (clock-taxonomy.mdx §10.2, openapi
   --  clock.progress): a negative delta empties the clock, consuming
   --  existing overflow first, and preserves the invariant
   --  Overflow > 0 => Segments = Size (W6).
   procedure Progress (Item : in out Clock_State; Amount : Natural;
                       Applied : out Natural)
   with Post =>
     (if Amount <= Item.Size - Item'Old.Segments then
        Item.Segments = Item'Old.Segments + Amount
          and Applied = Amount
          and (if Item.Kind = Rollover then Item.Overflow = Item'Old.Overflow
               else Item.Overflow = 0)
      else
        Item.Segments = Item.Size
          and Applied = Item.Size - Item'Old.Segments
          and (if Item.Kind = Rollover
               then Item.Overflow = Item'Old.Overflow + Amount - Applied
               else Item.Overflow = 0));

   --  SC-O5 frozen contract (clock-taxonomy.mdx §10.4): reset applies AT
   --  MOST ONE clock size of carried overflow and retains the remainder.
   procedure Reset (Item : in out Clock_State)
   with Post =>
     (if Item.Kind = Project then
        Item.Segments = 0 and Item.Overflow = 0
      else
        Item.Segments = Natural'Min (Item.Size, Item'Old.Overflow)
          and Item.Overflow =
            (if Item'Old.Overflow > Item.Size
             then Item'Old.Overflow - Item.Size else 0));
end Paperclips_Core.Clocks;
