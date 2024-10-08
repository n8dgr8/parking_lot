import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { upgradeWebSocket } from "https://deno.land/x/hono@v4.3.11/adapter/deno/index.ts";
import { WSContext } from "https://deno.land/x/hono@v4.3.11/helper/websocket/index.ts";
import { serveStatic } from "https://deno.land/x/hono@v4.3.11/middleware/serve-static/index.ts";

const app = new Hono();

const kv = await Deno.openKv();

type Spot = 'spot1' | 'spot2' | 'spot3' | 'spot4';

type SpotStatus = 'occupied' | 'unoccupied';

const websockets: WSContext[] = [];

app.get(
  '/ws',
  upgradeWebSocket(() => {
    return {
      async onOpen(_event, ws: WSContext) {
        websockets.push(ws);
        ws.send(JSON.stringify(await getParkingLot()));
      },
      onClose: (_event, ws: WSContext) => {
        const wsIndex = websockets.indexOf(ws);
        websockets.splice(wsIndex, 1);
      }
    }
  })
)

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

    const parkingLot = JSON.stringify(await getParkingLot());

    for (const websocket of websockets) {
      if (websocket.readyState == 1) {
        websocket.send(parkingLot);
      }
    }

    return c.text('OK', 201);
  }
  else {
    return c.text('Not OK', 401);
  }
});

const getParkingLot = async () => {
  const spots = kv.list({prefix: ['300-apollo', 'parking-lot']});

  const parkingLot = [];

  for await (const spot of spots) {
    const spotKey: string = spot.key.at(-1) as string;
    parkingLot.push({
      id: spotKey,
      status: spot.value
    });
  }

  return parkingLot;
}

app.get('/parking_lot', async (c) => {
  const returnStructure = await getParkingLot();
  return(
    c.json(
      returnStructure,
      200
    )
  );
});

app.use(
  '/index.html',
  serveStatic(
    {
      root: './',
      getContent: async () => {
        return await Deno.readFile('./static/index.html');
      }
    }
  )
);

Deno.serve(app.fetch);
