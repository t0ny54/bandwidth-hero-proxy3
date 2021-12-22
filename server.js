#!/usr/bin/env node
'use strict'
import app from'express'
import authenticate from './src/authenticate'
import params from './src/params'
import proxy from './src/proxy'


const PORT = process.env.PORT || 8080

app.enable('trust proxy')
app.get('/', authenticate, params, proxy)
app.get('/favicon.ico', (req, res) => res.status(204).end())
app.listen(PORT, () => console.log(`Listening on ${PORT}`))
