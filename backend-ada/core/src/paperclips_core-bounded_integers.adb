pragma SPARK_Mode (On);

package body Paperclips_Core.Bounded_Integers is
   function Create (Maximum : Capacity; Value : Natural := 0)
                    return Bounded_Integer is
   begin
      return (Maximum => Maximum, Current => Value);
   end Create;

   procedure Add
     (Item    : in out Bounded_Integer;
      Amount  : Natural;
      Applied : out Natural) is
   begin
      if Amount <= Item.Maximum - Item.Current then
         Item.Current := Item.Current + Amount;
         Applied := Amount;
      else
         Applied := Item.Maximum - Item.Current;
         Item.Current := Item.Maximum;
      end if;
   end Add;

   procedure Subtract
     (Item    : in out Bounded_Integer;
      Amount  : Natural;
      Applied : out Natural) is
   begin
      if Amount <= Item.Current then
         Item.Current := Item.Current - Amount;
         Applied := Amount;
      else
         Applied := Item.Current;
         Item.Current := 0;
      end if;
   end Subtract;

   procedure Clear (Item : in out Bounded_Integer) is
   begin
      if Item.Current /= 0 then
         Item.Current := 0;
      end if;
   end Clear;
end Paperclips_Core.Bounded_Integers;
