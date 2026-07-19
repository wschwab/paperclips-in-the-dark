pragma SPARK_Mode (On);

package body Paperclips_Core.Gear is
   procedure Set_Commitment
     (Item : in out Gear_State; Kind : Commitment_Kind;
      Maximum_Bulk : Natural; Error : out Operation_Error) is
   begin
      if Item.Is_Locked then
         Error := Commitment_Locked;
      else
         Item.Commitment := Kind;
         Item.Committed_Bulk := Natural'Min (Item.Committed_Bulk, Maximum_Bulk);
         Error := No_Error;
      end if;
   end Set_Commitment;

   procedure Commit
     (Item : in out Gear_State; Bulk : Natural; Error : out Operation_Error) is
   begin
      if Item.Is_Locked then Error := Commitment_Locked;
      elsif Item.Commitment = None then Error := No_Commitment;
      elsif Bulk > Item.Bulk_Limit - Item.Committed_Bulk then Error := Over_Bulk;
      else Item.Committed_Bulk := Item.Committed_Bulk + Bulk; Error := No_Error;
      end if;
   end Commit;

   procedure Clear_Commitments
     (Item : in out Gear_State; Error : out Operation_Error) is
   begin
      if Item.Is_Locked then Error := Commitment_Locked;
      else
         Item.Commitment := None;
         Item.Committed_Bulk := 0;
         Item.Armor_Available := (others => False);
         Error := No_Error;
      end if;
   end Clear_Commitments;

   procedure Set_Lock (Item : in out Gear_State; Locked : Boolean) is
   begin Item.Is_Locked := Locked; end Set_Lock;

   procedure Set_Armor_Available
     (Item : in out Gear_State; Kind : Armor_Kind; Available : Boolean) is
   begin
      Item.Armor_Available (Kind) := Available;
      if not Available then Item.Armor_Used (Kind) := False; end if;
   end Set_Armor_Available;

   procedure Set_Armor_Used
     (Item : in out Gear_State; Kind : Armor_Kind; Used : Boolean;
      Error : out Operation_Error) is
   begin
      if Used and not Item.Armor_Available (Kind) then
         Error := Armor_Not_Available;
      else Item.Armor_Used (Kind) := Used; Error := No_Error;
      end if;
   end Set_Armor_Used;
end Paperclips_Core.Gear;
