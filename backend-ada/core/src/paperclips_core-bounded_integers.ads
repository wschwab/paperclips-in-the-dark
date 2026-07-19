pragma SPARK_Mode (On);

package Paperclips_Core.Bounded_Integers is
   type Bounded_Integer (Maximum : Capacity) is private;

   function Create (Maximum : Capacity; Value : Natural := 0)
                    return Bounded_Integer
     with Pre  => Value <= Maximum,
          Post => Bounded_Integers.Value (Create'Result) = Value;

   function Value (Item : Bounded_Integer) return Natural;

   procedure Add
     (Item    : in out Bounded_Integer;
      Amount  : Natural;
      Applied : out Natural)
   with Post =>
     (if Amount <= Item.Maximum - Value (Item'Old) then
          Value (Item) = Value (Item'Old) + Amount and Applied = Amount
      else
          Value (Item) = Item.Maximum
          and Applied = Item.Maximum - Value (Item'Old));

   procedure Subtract
     (Item    : in out Bounded_Integer;
      Amount  : Natural;
      Applied : out Natural)
   with Post =>
     (if Amount <= Value (Item'Old) then
          Value (Item) = Value (Item'Old) - Amount and Applied = Amount
      else
          Value (Item) = 0 and Applied = Value (Item'Old));

   procedure Clear (Item : in out Bounded_Integer)
     with Post => Value (Item) = 0;

private
   type Bounded_Integer (Maximum : Capacity) is record
      Current : Natural := 0;
   end record
   with Dynamic_Predicate => Bounded_Integer.Current <= Bounded_Integer.Maximum;

   function Value (Item : Bounded_Integer) return Natural is (Item.Current);
end Paperclips_Core.Bounded_Integers;
