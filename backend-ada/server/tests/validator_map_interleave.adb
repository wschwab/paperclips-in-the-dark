package body Validator_Map_Interleave is
   use GNATCOLL.JSON;

   protected Rendezvous is
      procedure Arrive (Synchronize : out Boolean);
      entry First_Map;
      entry Both_Maps;
   private
      Calls : Natural := 0;
      Arrivals : Natural := 0;
   end Rendezvous;

   protected body Rendezvous is
      procedure Arrive (Synchronize : out Boolean) is
      begin
         Calls := Calls + 1;
         Synchronize := Calls <= 2;
         if Synchronize then
            Arrivals := Arrivals + 1;
         end if;
      end Arrive;

      entry First_Map when Arrivals >= 1 is
      begin
         null;
      end First_Map;

      entry Both_Maps when Arrivals = 2 is
      begin
         null;
      end Both_Maps;
   end Rendezvous;

   procedure Real_Map
     (Val : JSON_Value;
      CB : access procedure (Name : UTF8_String; Value : JSON_Value));
   pragma Import (Ada, Real_Map, "__real_gnatcoll__json__map_json_object");

   procedure Wait_For_First_Map is
   begin
      Rendezvous.First_Map;
   end Wait_For_First_Map;

   procedure Map
     (Val : JSON_Value;
      CB : access procedure (Name : UTF8_String; Value : JSON_Value))
   is
      Synchronize : Boolean;
   begin
      Rendezvous.Arrive (Synchronize);
      if Synchronize then
         Rendezvous.Both_Maps;
      end if;
      Real_Map (Val, CB);
   end Map;
end Validator_Map_Interleave;
