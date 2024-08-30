import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { upgradeWebSocket } from "https://deno.land/x/hono@v4.3.11/adapter/deno/index.ts";

const app = new Hono();

const kv = await Deno.openKv();

type Spot = 'spot1' | 'spot2' | 'spot3' | 'spot4';

type SpotStatus = 'occupied' | 'unoccupied';


app.put('/spot/:id', async (c) => {
  const spotId: number = parseInt(c.req.param('id'), 10);

  if( (spotId <= 4) && (spotId >= 1) ) {
    const spotKey = 'spot' + spotId;
    const requestBody = await c.req.json();

    const spotStatus: SpotStatus = requestBody.status as SpotStatus;

    await kv.set(
      [
        '300-apollo',
        'parking-lot',
        spotKey
      ],
      spotStatus
    );
    return c.text('OK', 201);
  }
  else {
    return c.text('Not OK', 401);
  }
});

app.get('/', async (c) => {
  const spots = kv.list({prefix: ['300-apollo', 'parking-lot']});

  const returnStructure = {};

  for await (const spot of spots) {
    const spotKey: string = spot.key.at(-1) as string;
    returnStructure[spotKey] = spot.value;
  }

  return(
    c.json(
      returnStructure,
      200
    )
  );
});

Deno.serve(app.fetch);
