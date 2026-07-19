pragma SPARK_Mode (On);

package body Paperclips_Core.Funds is
   procedure Gain
     (Item : in out Fund; Requested : Natural;
      Applied : out Natural; Remainder : out Natural) is
      To_Satchel : Natural;
      To_Stash   : Natural;
      Left       : Natural;
   begin
      To_Satchel := Natural'Min
        (Requested, Item.Satchel_Max - Item.Satchel_Value);
      Item.Satchel_Value := Item.Satchel_Value + To_Satchel;
      Left := Requested - To_Satchel;
      To_Stash := Natural'Min (Left, Item.Stash_Max - Item.Stash_Value);
      Item.Stash_Value := Item.Stash_Value + To_Stash;
      Applied := To_Satchel + To_Stash;
      Remainder := Left - To_Stash;
   end Gain;

   procedure Spend
     (Item : in out Fund; Requested : Natural;
      Error : out Operation_Error) is
      From_Stash : Natural;
   begin
      if Requested > Max_Affordable (Item) then
         Error := Insufficient_Funds;
      elsif Requested <= Item.Satchel_Value then
         Item.Satchel_Value := Item.Satchel_Value - Requested;
         Error := No_Error;
      else
         From_Stash := Requested - Item.Satchel_Value;
         Item.Satchel_Value := 0;
         Item.Stash_Value := Item.Stash_Value - 2 * From_Stash;
         Error := No_Error;
      end if;
   end Spend;

   procedure Liquidate
     (Item : in out Fund; Coins : Natural; Error : out Operation_Error) is
   begin
      if Coins > Item.Satchel_Max - Item.Satchel_Value then
         Error := Satchel_Full;
      elsif Coins > Item.Stash_Value / 2 then
         Error := Insufficient_Funds;
      else
         Item.Satchel_Value := Item.Satchel_Value + Coins;
         Item.Stash_Value := Item.Stash_Value - 2 * Coins;
         Error := No_Error;
      end if;
   end Liquidate;
end Paperclips_Core.Funds;
