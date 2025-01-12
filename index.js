// Importar las dependencias necesarias
const express = require("express");
const bodyParser = require("body-parser");
const { Client } = require("pg");

// Crear la aplicación Express
const app = express();
const port = 3000;

const session = require("express-session");

app.use(
  session({
    secret: "mi-secreto", // Cambia esto por una cadena más segura en un entorno de producción
    resave: false,
    saveUninitialized: true,
  })
);


// Configuración para servir archivos estáticos (páginas HTML)
app.use(express.static("public"));

// Configuración del middleware body-parser para manejar formularios
app.use(bodyParser.urlencoded({ extended: true }));

// Configuración de la conexión a PostgreSQL
const client = new Client({
  user: "postgres", // Usuario predeterminado de PostgreSQL
  host: "localhost", // El servidor de la base de datos
  database: "CNE", // Nombre de la base de datos
  password: "2007", // Contraseña de PostgreSQL
  port: 5432, // Puerto por defecto de PostgreSQL
});

client
  .connect()
  .then(() => console.log("Conectado a PostgreSQL"))
  .catch((err) => console.error("Error al conectar a PostgreSQL", err));

// Ruta principal, muestra el enlace al inicio de sesión
app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Bienvenido</title>
        <link rel="stylesheet" type="text/css" href="/styles.css">
      </head>
      <body>
        <h1>Bienvenido al sistema electoral</h1>
        <p><a href="/login" class="btn">Iniciar sesión</a></p>
        <!-- Botón para ver resultados -->
        <p><a href="/mostrar-resultados" class="btn">Ver Resultados</a></p>
        <!-- Nuevo botón para Datos no válidos -->
        <p><a href="/datos-no-validos" class="btn">Datos no válidos</a></p>
      </body>
    </html>
  `);
});

// Ruta para mostrar el formulario de inicio de sesión
app.get("/login", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Iniciar Sesión</title>
        <link rel="stylesheet" type="text/css" href="/styles.css">
      </head>
      <body>
        <h1>Inicio de Sesión</h1>
        <form action="/login-action" method="POST">
          <label for="username">Usuario:</label>
          <input type="text" id="username" name="username" required><br><br>
          <label for="password">Contraseña:</label>
          <input type="password" id="password" name="password" required><br><br>
          <button type="submit" class="btn">Ingresar</button>
        </form>
        <p><a href="/" class="btn">Volver al inicio</a></p>
      </body>
    </html>
  `);
});
// Ruta de procesamiento de inicio de sesión
app.post("/login-action", (req, res) => {
  const { username, password } = req.body;

  // Consulta SQL para verificar las credenciales
  const query = "SELECT * FROM usuarios WHERE username = $1 AND password = $2";

  client.query(query, [username, password], (err, result) => {
    if (err) {
      console.error("Error de consulta:", err);
      res.send("Error al verificar las credenciales");
      return;
    }

    if (result.rows.length === 0) {
      res.send(`
        <h1>Credenciales incorrectas</h1>
        <p><a href="/login" class="btn">Volver a intentar</a></p>
      `);
    } else {
      // Guardar el nombre de usuario en la sesión
      req.session.username = username;

      // Redirigir a la página de conteo si el inicio de sesión es exitoso
      res.redirect("/conteo");
    }
  });
});
// Ruta para mostrar la página de conteo
app.get("/conteo", (req, res) => {
  res.sendFile(__dirname + "/public/Conteo.html");
});

//Resultado
app.get("/datos-no-validos", (req, res) => {
  const provinciaSeleccionada = req.query.provincia || "";
  const cantonSeleccionado = req.query.canton || "";

  // Obtener provincias para mostrar en el filtro, ordenadas alfabéticamente
  const obtenerProvinciasQuery =
    "SELECT DISTINCT provincia FROM provincias_a ORDER BY provincia";
  client.query(obtenerProvinciasQuery, (err, provinciasResult) => {
    if (err) {
      console.error("Error al obtener las provincias:", err);
      res.status(500).send("Error al obtener las provincias");
      return;
    }

    // Consultar cantones para mostrar en el filtro, ordenados alfabéticamente, si hay una provincia seleccionada
    let obtenerCantonesQuery =
      "SELECT DISTINCT canton, provincia FROM provincias_a";
    if (provinciaSeleccionada) {
      obtenerCantonesQuery += ` WHERE provincia = $1 ORDER BY canton`;
    }

    client.query(
      obtenerCantonesQuery,
      provinciaSeleccionada ? [provinciaSeleccionada] : [],
      (err, cantonesResult) => {
        if (err) {
          console.error("Error al obtener los cantones:", err);
          res.status(500).send("Error al obtener los cantones");
          return;
        }

        // Consultas para obtener datos de ambas tablas (votos especiales y actas detalladas)
        let queryVotosEspecialesError = "SELECT * FROM votos_especiales_error";
        let queryActasDetalladas = "SELECT * FROM actas_detalladas";

        // Condición para filtrar por provincia
        if (provinciaSeleccionada) {
          queryVotosEspecialesError += ` WHERE provincia = $1`;
          queryActasDetalladas += ` WHERE provincia = $1`;
        }

        // Condición para filtrar por canton, con una búsqueda por similitud si el canton no se encuentra
        if (cantonSeleccionado) {
          queryVotosEspecialesError += ` AND canton ILIKE $2`;
          queryActasDetalladas += ` AND canton ILIKE $2`;
        }

        // Ejecutar la consulta para votos especiales error
        client.query(
          queryVotosEspecialesError,
          provinciaSeleccionada && cantonSeleccionado
            ? [provinciaSeleccionada, "%" + cantonSeleccionado + "%"]
            : provinciaSeleccionada
            ? [provinciaSeleccionada]
            : cantonSeleccionado
            ? ["%" + cantonSeleccionado + "%"]
            : [],
          (err, resultVotosEspecialesError) => {
            if (err) {
              console.error("Error al obtener votos especiales error:", err);
              res
                .status(500)
                .send("Error al obtener los votos especiales error");
              return;
            }

            // Ejecutar la consulta para actas detalladas
            client.query(
              queryActasDetalladas,
              provinciaSeleccionada && cantonSeleccionado
                ? [provinciaSeleccionada, "%" + cantonSeleccionado + "%"]
                : provinciaSeleccionada
                ? [provinciaSeleccionada]
                : cantonSeleccionado
                ? ["%" + cantonSeleccionado + "%"]
                : [],
              (err, resultActasDetalladas) => {
                if (err) {
                  console.error("Error al obtener actas detalladas:", err);
                  res.status(500).send("Error al obtener actas detalladas");
                  return;
                }

                const votosEspecialesError = resultVotosEspecialesError.rows;
                const actasDetalladas = resultActasDetalladas.rows;

                // Generar la vista con los resultados obtenidos
                res.send(`
                  <html>
                    <head>
                      <title>Datos No Válidos</title>
                      <link rel="stylesheet" type="text/css" href="/styles.css">
                      <style>
                        body { font-family: Arial, sans-serif; background-color: #f4f7fc; margin: 0; padding: 20px; color: #333; }
                        h1 { text-align: center; color: #0056b3; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1); }
                        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
                        th { background-color: #007BFF; color: #fff; font-size: 16px; }
                        tr:hover { background-color: #f1f1f1; }
                        .container { max-width: 1200px; margin: 0 auto; padding: 20px; background-color: #fff; border-radius: 8px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1); }
                        form { margin-bottom: 20px; display: flex; justify-content: center; align-items: center; }
                        select { padding: 8px; margin-right: 10px; font-size: 16px; }
                        .btn { padding: 8px 16px; background-color: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; }
                        .btn:hover { background-color: #218838; }
                      </style>
                    </head>
                    <body>
                      <div class="container">
                        <h1>Datos No Válidos</h1>

                        <!-- Filtro de Provincias -->
                        <form action="/datos-no-validos" method="GET">
                          <label for="provincia">Selecciona una provincia:</label>
                          <select name="provincia" id="provincia">
                            <option value="">Todos</option>
                            ${provinciasResult.rows
                              .map(
                                (provincia) => `
                                  <option value="${provincia.provincia}" ${
                                  provincia.provincia === provinciaSeleccionada
                                    ? "selected"
                                    : ""
                                }>${provincia.provincia}</option>
                                `
                              )
                              .join("")}
                          </select>

                          <!-- Filtro de Cantones -->
                          <label for="canton">Selecciona un cantón:</label>
                          <select name="canton" id="canton">
                            <option value="">Todos</option>
                            ${
                              cantonesResult.rows &&
                              cantonesResult.rows.length > 0
                                ? cantonesResult.rows
                                    .map(
                                      (canton) => `
                                        <option value="${canton.canton}" ${
                                        canton.canton === cantonSeleccionado
                                          ? "selected"
                                          : ""
                                      }>${canton.canton}</option>
                                      `
                                    )
                                    .join("")
                                : '<option value="">No se encontraron cantones</option>'
                            }
                          </select>

                          <button type="submit" class="btn">Filtrar</button>
                        </form>

                        <h2>Resultados Votos Especiales Error ${
                          provinciaSeleccionada
                            ? "de la provincia " + provinciaSeleccionada
                            : "Generales"
                        } ${
                  cantonSeleccionado ? "en el cantón " + cantonSeleccionado : ""
                }</h2>
                        <table>
                          <thead>
                            <tr>
                              <th>Código Único</th>
                              <th>Votos Nulos</th>
                              <th>Votos Blancos</th>
                              <th>Provincia</th>
                              <th>Cantón</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${votosEspecialesError
                              .map(
                                (dato) => `
                                  <tr>
                                    <td>${dato.codigo_unico}</td>
                                    <td>${dato.votos_nulos}</td>
                                    <td>${dato.votos_blancos}</td>
                                    <td>${dato.provincia}</td>
                                    <td>${dato.canton}</td>
                                  </tr>
                                `
                              )
                              .join("")}
                          </tbody>
                        </table>

                        <h2>Resultados Actas Detalladas ${
                          provinciaSeleccionada
                            ? "de la provincia " + provinciaSeleccionada
                            : "Generales"
                        } ${
                  cantonSeleccionado ? "en el cantón " + cantonSeleccionado : ""
                }</h2>
                        <table>
                          <thead>
                            <tr>
                              <th>Código Único</th>
                              <th>Provincia</th>
                              <th>Cantón</th>
                              <th>Nombre Candidato</th>
                              <th>Votos Obtenidos</th>
                              <th>Presentó Error</th>
                              <th>Fecha Registro</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${actasDetalladas
                              .map(
                                (dato) => `
                                  <tr>
                                    <td>${dato.codigo_unico}</td>
                                    <td>${dato.provincia}</td>
                                    <td>${dato.canton}</td>
                                    <td>${dato.nombre_candidato}</td>
                                    <td>${dato.votos_obtenidos}</td>
                                    <td>${
                                      dato.presento_error ? "Sí" : "No"
                                    }</td>
                                    <td>${dato.fecha_registro}</td>
                                  </tr>
                                `
                              )
                              .join("")}
                          </tbody>
                        </table>

                        <p><a href="/" class="btn">Volver al inicio</a></p>
                      </div>
                    </body>
                  </html>
                `);
              }
            );
          }
        );
      }
    );
  });
});

// Ruta para mostrar los resultados con gráfico
app.get("/mostrar-resultados", (req, res) => {
  const provinciaSeleccionada = req.query.provincia || ""; // Leer la provincia seleccionada
  const cantonSeleccionado = req.query.canton || ""; // Leer el cantón seleccionado

  // Definir las provincias en el orden específico que necesitas
  const provinciasOrdenadas = [
    "Azuay",
    "Bolívar",
    "Cañar",
    "Carchi",
    "Chimborazo",
    "Cotopaxi",
    "El Oro",
    "Esmeraldas",
    "Galápagos",
    "Guayas",
    "Imbabura",
    "Loja",
    "Los Ríos",
    "Manabí",
    "Morona Santiago",
    "Napo",
    "Orellana",
    "Pastaza",
    "Pichincha",
    "Tungurahua",
    "Zamora-Chinchipe",
    "Santo Domingo de los Tsáchilas",
    "Santa Elena",
    "Sucumbíos",
  ];

  // Obtener cantones filtrados por la provincia seleccionada
  const obtenerCantonesQuery =
    "SELECT DISTINCT canton FROM provincias_a WHERE provincia = $1";
  client.query(
    obtenerCantonesQuery,
    [provinciaSeleccionada],
    (err, cantonesResult) => {
      if (err) {
        console.error("Error al obtener los cantones:", err);
        res.send("Error al obtener los cantones");
        return;
      }

      // Modificar la consulta para filtrar por provincia y cantón si es necesario
      let query = `
      SELECT nombre_candidato, SUM(votos) AS votos
      FROM resultados
    `;

      // Filtrar por provincia y cantón
      const queryParams = [];
      if (provinciaSeleccionada) {
        query += ` WHERE provincia = $1`;
        queryParams.push(provinciaSeleccionada);
      }
      if (cantonSeleccionado) {
        query += provinciaSeleccionada
          ? ` AND canton = $2`
          : ` WHERE canton = $1`;
        queryParams.push(cantonSeleccionado);
      }

      query += ` GROUP BY nombre_candidato`;

      client.query(query, queryParams, (err, result) => {
        if (err) {
          console.error("Error al obtener los resultados:", err);
          res.send("Error al obtener los resultados");
          return;
        }

        const candidatos = result.rows;

        // Sumar el total de votos para calcular porcentajes
        const totalVotos = candidatos.reduce(
          (sum, candidato) => sum + parseInt(candidato.votos),
          0
        );

        const datos = candidatos.map((candidato) => {
          const porcentaje = (parseInt(candidato.votos) / totalVotos) * 100;
          return {
            nombre: candidato.nombre_candidato,
            votos: candidato.votos,
            porcentaje: porcentaje,
          };
        });

        // Generar la vista
        res.send(`
      <html>
        <head>
          <title>Resultados Electorales</title>
          <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        </head>
        <body>
          <h1>Resultados Electorales</h1>

          <!-- Filtro de Provincias -->
          <form action="/mostrar-resultados" method="GET">
            <label for="provincia">Selecciona una provincia:</label>
            <select name="provincia" id="provincia">
              <option value="">Todas</option>
              ${provinciasOrdenadas
                .map(
                  (provincia) =>
                    `<option value="${provincia}" ${
                      provincia === provinciaSeleccionada ? "selected" : ""
                    }>${provincia}</option>`
                )
                .join("")}
            </select>
            
            <label for="canton">Selecciona un cantón:</label>
            <select name="canton" id="canton">
              <option value="">Todos</option>
              ${cantonesResult.rows
                .map(
                  (canton) =>
                    `<option value="${canton.canton}" ${
                      canton.canton === cantonSeleccionado ? "selected" : ""
                    }>${canton.canton}</option>`
                )
                .join("")}
            </select>
            
            <button type="submit" class="btn">Filtrar</button>
          </form>

          <h2>Resultados ${
            provinciaSeleccionada
              ? "de la provincia " + provinciaSeleccionada
              : "Generales"
          }</h2>

          <canvas id="graficoResultados" width="600" height="400"></canvas>
          
          <script>
            const data = ${JSON.stringify(datos)};
            const labels = data.map(d => \`\${d.nombre} (\${d.porcentaje.toFixed(2)}%)\`);
            const votes = data.map(d => d.porcentaje);
            const votosTotales = data.map(d => d.votos);

            const ctx = document.getElementById('graficoResultados').getContext('2d');
            const chartData = {
              labels: labels,
              datasets: [{
                label: 'Porcentaje de Votos',
                data: votes,
                backgroundColor: 'rgba(0, 123, 255, 0.6)',
                borderColor: 'rgba(0, 123, 255, 1)',
                borderWidth: 1
              }]
            };

            const config = {
              type: 'bar',
              data: chartData,
              options: {
                indexAxis: 'y',
                responsive: true,
                scales: {
                  x: { beginAtZero: true }
                },
                plugins: {
                  tooltip: {
                    callbacks: {
                      label: function(tooltipItem) {
                        let percentage = tooltipItem.raw.toFixed(2);
                        let votes = votosTotales[tooltipItem.dataIndex];
                        return \`\${percentage}% (\${votes} votos)\`;
                      }
                    }
                  }
                }
              }
            };

            new Chart(ctx, config);
          </script>
            <p><a href="/" class="btn">Volver al inicio</a></p>
        </body>
      </html>
    `);
      });
    }
  );
});

// Ruta para agregar votos a la tabla de resultados
app.post("/agregar-voto", async (req, res) => {
  const { provincia, canton, codigo_unico, votos_nulos, votos_blancos } =
    req.body;

  try {
    // Verificar si el usuario ha iniciado sesión
    if (!req.session.username) {
      return res.send(`
        <h1>Error</h1>
        <p>No has iniciado sesión. <a href="/login" class="btn">Inicia sesión</a></p>
      `);
    }

    // Obtener el username del usuario desde la sesión
    const usuarioProvincia = req.session.username; // El nombre de usuario es el nombre de la provincia

    // Verificar que el 'provincia' proporcionado en el formulario coincida con el username
    if (provincia !== usuarioProvincia) {
      return res.send(`
        <h1>Error</h1>
        <p>No puedes ingresar votos para esta provincia. Debes ingresar votos para la provincia asociada a tu cuenta (tu nombre de usuario es: ${usuarioProvincia}).</p>
        <p><a href="/login" class="btn">Volver a intentar</a></p>
      `);
    }

    // Verificar si el codigo_unico ya existe en las tablas correspondientes
    const verificarCodigoQuery = `
      SELECT COUNT(*) FROM actas_detalladas WHERE codigo_unico = $1
      UNION
      SELECT COUNT(*) FROM resultados WHERE codigo_unico = $1
      UNION
      SELECT COUNT(*) FROM votos_especiales_error WHERE codigo_unico = $1
      UNION
      SELECT COUNT(*) FROM voto_especial WHERE codigo_unico = $1;
    `;

    const resultCodigo = await client.query(verificarCodigoQuery, [
      codigo_unico,
    ]);

    // Si el codigo_unico ya existe en alguna tabla
    const existeCodigo = resultCodigo.rows.some((row) => row.count > 0);

    if (existeCodigo) {
      return res.send(`
        <h1>Error</h1>
        <p>El código único ${codigo_unico} ya existe en la base de datos.</p>
        <p><a href="/conteo" class="btn">Volver al conteo</a></p>
      `);
    }

    // Verificar si la provincia existe en la tabla provincias
    const verificarProvinciaQuery =
      "SELECT COUNT(*) FROM provincias WHERE nombre = $1";
    const resultProvincia = await client.query(verificarProvinciaQuery, [
      provincia,
    ]);

    const hayErrorProvincia = resultProvincia.rows[0].count == 0;

    // Verificar si el cantón existe en la tabla ciudades
    const verificarCantonQuery =
      "SELECT COUNT(*) FROM ciudades WHERE canton = $1 AND provincia = $2";
    const resultCanton = await client.query(verificarCantonQuery, [
      canton,
      provincia,
    ]);

    const hayErrorCanton = resultCanton.rows[0].count == 0;

    const votosCandidatos = [];
    const errores = [];
    const verificarCandidatosPromises = [];

    // Recorre los candidatos en el request
    for (let key in req.body) {
      if (key.startsWith("nombre_candidato_")) {
        const index = key.split("_")[2];
        const nombreCandidato = req.body[key];
        const votos = req.body[`votos_${index}`];

        if (nombreCandidato && votos !== undefined) {
          const verificarCandidatoQuery =
            "SELECT COUNT(*) FROM candidatos WHERE nombre = $1";

          const verificarCandidatoPromise = client
            .query(verificarCandidatoQuery, [nombreCandidato])
            .then((resultCandidato) => {
              const existeCandidato = resultCandidato.rows[0].count > 0;

              votosCandidatos.push({
                nombre_candidato: nombreCandidato,
                votos: parseInt(votos),
                presento_error:
                  hayErrorProvincia || hayErrorCanton || !existeCandidato,
              });

              if (!existeCandidato) {
                errores.push(
                  `El candidato ${nombreCandidato} no existe en la base de datos.`
                );
              }
            });

          verificarCandidatosPromises.push(verificarCandidatoPromise);
        }
      }
    }

    await Promise.all(verificarCandidatosPromises);

    // Si hay errores en la provincia, canton o candidatos, no subir los datos
    if (hayErrorProvincia || hayErrorCanton || errores.length > 0) {
      return res.send(`
        <h1>Error al Agregar Votos</h1>
        <p>La inserción no se ha realizado debido a errores en los datos proporcionados:</p>
        <ul>
          ${
            hayErrorProvincia
              ? `<li>La provincia ${provincia} no existe en la base de datos.</li>`
              : ""
          }
          ${
            hayErrorCanton
              ? `<li>El cantón ${canton} no existe en la base de datos.</li>`
              : ""
          }
          ${errores.map((error) => `<li>${error}</li>`).join("")}
        </ul>
        <p><a href="/conteo" class="btn">Volver al conteo</a></p>
      `);
    }

    // Si no hay errores, insertamos los votos normales en `resultados`
    for (const voto of votosCandidatos) {
      const insertResultadoQuery =
        "INSERT INTO resultados (nombre_candidato, votos, provincia, canton, codigo_unico) VALUES ($1, $2, $3, $4, $5)";
      await client.query(insertResultadoQuery, [
        voto.nombre_candidato,
        voto.votos,
        provincia,
        canton,
        codigo_unico,
      ]);
    }

    // Insertar los votos nulos y blancos en `voto_especial` si todo es correcto
    const insertVotoEspecialQuery = `
      INSERT INTO voto_especial (votos_nulos, votos_blancos, codigo_unico, provincia, canton) 
      VALUES ($1, $2, $3, $4, $5);
    `;

    await client.query(insertVotoEspecialQuery, [
      parseInt(votos_nulos) || 0,
      parseInt(votos_blancos) || 0,
      codigo_unico,
      provincia,
      canton,
    ]);

    res.send(`
      <h1>Votos Agregados Exitosamente</h1>
      <p>Los votos de los candidatos y los votos especiales (nulos y blancos) han sido agregados correctamente.</p>
      <p><a href="/conteo" class="btn">Volver al conteo</a></p>
    `);
  } catch (err) {
    console.error("Error al procesar la solicitud:", err);
    res.send("Error al agregar los votos. Por favor, intenta de nuevo.");
  }
});
//A

// Ruta para cerrar sesión y redirigir a la página de inicio de sesión
app.get("/logout", (req, res) => {
  res.redirect("/login");
});

// Iniciar el servidor en la IP local y el puerto deseado
app.listen(port, () => {
  console.log(`Servidor en ejecución`);
});
