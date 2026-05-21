import { Firestore } from '@google-cloud/firestore';
import * as ff from '@google-cloud/functions-framework';

const firestore = new Firestore();

ff.http('spotHandler', async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight options request
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  // Parse path
  const path = req.path || req.url.split('?')[0];

  try {
    // 1. Ingestion: PUT /spot?id=X
    if (path === '/spot' && req.method === 'PUT') {
      const spotId = parseInt(req.query.id, 10);
      if (isNaN(spotId) || spotId < 1 || spotId > 4) {
        res.status(400).send('Not OK: Invalid spot ID');
        return;
      }

      const spotKey = `spot${spotId}`;
      const { status: newSpotStatus } = req.body;

      if (newSpotStatus !== 'occupied' && newSpotStatus !== 'unoccupied') {
        res.status(400).send('Not OK: Invalid status');
        return;
      }

      console.log(`Spot [${spotKey}] is now ${newSpotStatus}`);

      const stateDocRef = firestore.collection('spots').doc('state');
      const doc = await stateDocRef.get();
      const timestamp = Date.now();

      let currentStatus = null;
      if (doc.exists) {
        const data = doc.data();
        if (data[spotKey]) {
          currentStatus = data[spotKey].status;
        }
      }

      // Only update and log if state changed or doesn't exist
      if (currentStatus !== newSpotStatus) {
        await stateDocRef.set({
          [spotKey]: {
            status: newSpotStatus,
            timestamp: timestamp
          }
        }, { merge: true });

        // Write historical record
        await firestore.collection('history').add({
          spotId: spotKey,
          status: newSpotStatus,
          timestamp: timestamp
        });
      }

      res.status(201).send('OK');
      return;
    }

    // 2. Fetch current state: GET /parking_lot
    if (path === '/parking_lot' && req.method === 'GET') {
      const stateDocRef = firestore.collection('spots').doc('state');
      const doc = await stateDocRef.get();

      const parkingLot = [];
      const defaultState = {
        spot1: { status: 'unoccupied', timestamp: Date.now() },
        spot2: { status: 'unoccupied', timestamp: Date.now() },
        spot3: { status: 'unoccupied', timestamp: Date.now() },
        spot4: { status: 'unoccupied', timestamp: Date.now() }
      };

      const data = doc.exists ? doc.data() : defaultState;

      for (let i = 1; i <= 4; i++) {
        const spotKey = `spot${i}`;
        const val = data[spotKey] || { status: 'unoccupied', timestamp: Date.now() };
        parkingLot.push({
          id: spotKey,
          status: val.status,
          timestamp: val.timestamp
        });
      }

      res.status(200).json(parkingLot);
      return;
    }

    // 3. Raw History: GET /parking_lot/rawHistory
    if (path === '/parking_lot/rawHistory' && req.method === 'GET') {
      const snapshot = await firestore.collection('history').orderBy('timestamp', 'asc').get();
      const historyList = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        historyList.push({
          spotId: data.spotId,
          value: data.status,
          timestamp: data.timestamp
        });
      });
      res.status(200).json(historyList);
      return;
    }

    // 4. Grouped History: GET /parking_lot/history
    if (path === '/parking_lot/history' && req.method === 'GET') {
      const snapshot = await firestore.collection('history').orderBy('timestamp', 'asc').get();
      const history = {
        spot1: {},
        spot2: {},
        spot3: {},
        spot4: {}
      };

      snapshot.forEach(doc => {
        const data = doc.data();
        if (history[data.spotId]) {
          history[data.spotId][data.timestamp] = data.status;
        }
      });

      res.status(200).json(history);
      return;
    }

    res.status(404).send('Not Found');
  } catch (error) {
    console.error('Error handling request:', error);
    res.status(500).json({ error: error.message });
  }
});
