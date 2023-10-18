import express from 'express';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createClient } from '@libsql/client';
import { Server } from 'socket.io';
import { createServer } from 'node:http';
dotenv.config();

const port = process.env.PORT ?? 3001;

const app = express(); // Creamos un server con express
const server = createServer(app); // Inicializamos el server de express con http y lo guardamos en una variable.
const io = new Server(server, {
  connectionStateRecovery: { // Durante cuanto tiempo va a guardar el evento

  }
}); // Corremos el server con socket.io y lo guardamos en una variable.

const db = createClient({
  url: process.env.DB_URL,
  authToken: process.env.DB_TOKEN
});

// Creamos la tabla de la Base de Datos
await db.execute(`
  CREATE TABLE IF NOT EXISTS messages(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    username TEXT
  )
`);

// Creamos la conexión del socket.io
io.on('connection', async (socket) => {
  console.log('A user has connected!');

  socket.on('disconnect', () => {
    console.log('A user has disconnected!');
  });

  socket.on('chat message', async (msg) => { // Guardamos el mensaje en la DB
    let result;
    const username = socket.handshake.auth.username ?? 'anonymous';
    try {
      result = await db.execute({
        sql: 'INSERT INTO messages (content, username) VALUES (:msg, :username)',
        args: { msg, username }
      });
    } catch (error) {
      console.log(error);
      return { error: error.message };
    }

    io.emit('chat message', msg, result.lastInsertRowid.toString(), username); // Envia el parametro, el mensaje y la última id de nuestra base de datos y lo transformamos a String
  });

  if (!socket.recovered) { // Si no se recuperó de una desconexión
    try {
      const results = await db.execute({
        sql: 'SELECT id, content, username FROM messages WHERE id > ?',
        args: [socket.handshake.auth.serverOffset ?? 0] // Aqui recuperamos el último mensaje de la DB
      });

      results.rows.forEach(row => {
        socket.emit('chat message', row.content, row.id.toString(), row.username);
      });
    } catch (error) {
      console.log(error);
    }
  }
});

app.use(morgan('dev'));

app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/client/index.html');
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
