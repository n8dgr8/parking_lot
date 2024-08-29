import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { upgradeWebSocket } from "https://deno.land/x/hono@v4.3.11/adapter/deno/index.ts";

const app = new Hono();

app.parkingLot = {
    'spot1': 'occupied',
    'spot2': 'occupied',
    'spot3': 'unoccupied',
    'spot4': 'occupied'
};



app.get('/', (c) => {
  return(c.json(app.parkingLot));
});

Deno.serve(app.fetch);
