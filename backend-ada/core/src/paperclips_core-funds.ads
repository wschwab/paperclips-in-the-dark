pragma SPARK_Mode (On);

package Paperclips_Core.Funds is
   type Fund (Satchel_Max : Capacity; Stash_Max : Capacity) is private;

   function Satchel (Item : Fund) return Natural;
   function Stash (Item : Fund) return Natural;
   function Max_Affordable (Item : Fund) return Natural is
     (Satchel (Item) + Stash (Item) / 2);

   procedure Gain
     (Item : in out Fund; Requested : Natural;
      Applied : out Natural; Remainder : out Natural)
   with Post => Applied <= Requested
     and Remainder = Requested - Applied
     and Applied =
       Natural'Min
         (Requested,
          Item.Satchel_Max - Satchel (Item'Old)
          + Item.Stash_Max - Stash (Item'Old))
     and Satchel (Item) =
       Satchel (Item'Old)
       + Natural'Min (Requested, Item.Satchel_Max - Satchel (Item'Old));

   procedure Spend
     (Item : in out Fund; Requested : Natural;
      Error : out Operation_Error)
   with Post =>
     (if Requested > Max_Affordable (Item'Old) then
          Error = Insufficient_Funds
          and Satchel (Item) = Satchel (Item'Old)
          and Stash (Item) = Stash (Item'Old)
      else Error = No_Error
           and (if Requested <= Satchel (Item'Old) then
                  Satchel (Item) = Satchel (Item'Old) - Requested
                  and Stash (Item) = Stash (Item'Old)
                else Satchel (Item) = 0
                  and Stash (Item) = Stash (Item'Old)
                    - 2 * (Requested - Satchel (Item'Old))));

   procedure Liquidate
     (Item : in out Fund; Coins : Natural; Error : out Operation_Error)
   with Post =>
     (if Coins > Item.Satchel_Max - Satchel (Item'Old) then
          Error = Satchel_Full
      elsif Coins > Stash (Item'Old) / 2 then
          Error = Insufficient_Funds
      else Error = No_Error
           and Satchel (Item) = Satchel (Item'Old) + Coins
           and Stash (Item) = Stash (Item'Old) - 2 * Coins);

private
   type Fund (Satchel_Max : Capacity; Stash_Max : Capacity) is record
      Satchel_Value : Natural := 0;
      Stash_Value   : Natural := 0;
   end record
   with Dynamic_Predicate => Fund.Satchel_Value <= Fund.Satchel_Max
     and Fund.Stash_Value <= Fund.Stash_Max;
   function Satchel (Item : Fund) return Natural is (Item.Satchel_Value);
   function Stash (Item : Fund) return Natural is (Item.Stash_Value);
end Paperclips_Core.Funds;
