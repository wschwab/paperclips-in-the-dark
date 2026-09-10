with GNATCOLL.JSON;

package Validator_Map_Interleave is
   --  Start the second validator only after the first has selected its
   --  allowed fields, then hold both at the JSON-map boundary. This forces
   --  the shared-state overwrite without sleeps or scheduling assumptions.
   procedure Wait_For_First_Map;

   procedure Map
     (Val : GNATCOLL.JSON.JSON_Value;
      CB : access procedure
        (Name : GNATCOLL.JSON.UTF8_String;
         Value : GNATCOLL.JSON.JSON_Value));
   pragma Export (Ada, Map, "__wrap_gnatcoll__json__map_json_object");
end Validator_Map_Interleave;
