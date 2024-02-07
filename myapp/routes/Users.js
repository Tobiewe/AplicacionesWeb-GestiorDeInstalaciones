const express = require('express');
const router = express.Router();
const mysql = require("mysql");
const config = require("../config/dbConfig");
const DAOUser = require("../dao/DAOUsuarios");
const DAOAdmin = require("../dao/DAOAdmin");
const bcrypt = require('bcrypt'); // Agrega esta línea para requerir bcrypt
const DAOInstalaciones = require('../dao/DAOInstalaciones');
const multer = require('multer');
const multerFactory = multer({ storage: multer.memoryStorage() });

// Crear un pool de conexiones a la base de datos de MySQL 
const pool = mysql.createPool(config.mysqlConfig);


daoUser = new DAOUser(pool);
daoAdmin = new DAOAdmin(pool);
daoinstalaciones = new DAOInstalaciones(pool);

// Metodo principal, login
router.get('/', (req, res) => {
    let mensaje = "";
    return res.render("login.ejs", { session: req.session, mensaje: mensaje });
});

// Metodo home donde aparecen las instalaciones para reservar
router.get('/home', (req, res) => {
    daoinstalaciones.getAllInstalaciones((err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Error de la base de datos' });
        }
        return res.render('home.ejs', { results: results, session: req.session });
    });
});

// Metodo mostrar view de espera hasta ser validado cuando te acabas de registrar
router.get('/validado', (req, res) => {
    return res.render('validado.ejs', { session: req.session });
});

// Metodo para inciar sesion
router.post('/InicioSesion', (req, res) => {
    const { email, password } = req.body;
    daoUser.getUserByEmail(email, (err, user) => {
        if (err) {
            return res.render('login.ejs', { mensaje: 'Usuario no encontrado.' });
        } else {
            bcrypt.compare(password, user.contraseña, (bcryptErr, result) => {
                if (bcryptErr) {
                    return res.render('login.ejs', { mensaje: 'Error al comparar contraseñas.' });
                } else if (result) {
                    req.session.email = email;
                    req.session.Id = user.Id;
                    req.session.rol = user.rol;
                    req.session.imagen = user.imagen_perfil;
                    req.session.facultad = user.facultad;
                    req.session.save(() => {
                        if (user.validado === '0') {
                            return res.redirect('/validado');
                        }
                        daoAdmin.mostrarOrganizacion((err, result) => {
                            if (err) {
                                return res.status(500).json({ error: 'Error interno del servidor' });
                            }
                            req.session.orgNombre = result.nombre;
                            req.session.orgDir = result.direccion;
                            req.session.orgIcono = result.imagen;
                            req.session.save(() => {
                                return res.redirect('/home');
                            });
                        });
                    });
                } else {
                    return res.render('login.ejs', { mensaje: 'Contraseña incorrecta.' });
                }
            });
        }
    });
});

// Metodo para mostrar el registro
router.get('/registro', (req, res) => {
    daoUser.getFacultades((err, facultades) => {
        if (err) {
            return res.status(500).json({ error: 'Error de la base de datos' });
        }
        let mensaje = "";
        return res.render("registro", { session: req.session, mensaje: mensaje, facultades: facultades, facultad: req.query.facultad });
    });
});

// Metodo para registrarse
router.post('/registrar', multerFactory.single('imagen'), (req, res) => {
    const { nombre, apellido1, apellido2, email, facultad, curso, grupo, password, confirmPassword } = req.body;
    let imagen = req.file ? req.file.buffer : null; // Se coge del req por que las files estan aqui
    const facultades = JSON.parse(req.body.facultades);
    daoUser.checkEmail(email, (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Error interno del servidor' });
        }

        if (result.length > 0) {
            return res.render('registro.ejs', { mensaje: 'El correo ya existe.', nombre, apellido1, apellido2, email, facultad, curso, grupo, facultades: facultades });
        }

        if (password.length < 8 || !/[A-Z]/.test(password) || !/\d/.test(password) || !/\W/.test(password) || password !== confirmPassword) {
            return res.render('registro.ejs', { mensaje: 'Las credenciales no cumplen con los requisitos.', nombre, apellido1, apellido2, email, facultad, curso, grupo, facultades: facultades });
        }
        bcrypt.hash(password, 10, (err, hash) => {
            if (err) {
                return res.status(500).json({ error: 'Error al hashear la contraseña' });
            } else {

                daoUser.insertUser(nombre, apellido1, apellido2, email, facultad, curso, grupo, hash, imagen, (err) => {
                    if(err){
                        return res.status(500).json({ error: 'Error interno del servidor' });
                    }
                    else{
                        daoUser.insertValidacion(email, (err) => {
                            if (err) {
                                return res.status(500).json({ error: 'Error interno del servidor' });
                            } else {
                                return res.redirect('/validado')
                            }
                        });
                    }
                });
            }
        });
    });
});

// Metodo para mostrar los datos del perfil
router.get('/perfil', (req, res) => {
    const mensaje = req.query.mensaje || ""; // Recupera el mensaje de la consulta, si está presente
    daoUser.checkEmail(req.session.email, (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Error de la base de datos' });
        }
        daoUser.getFacultades((err, facultades) => {
            if (err) {
                return res.status(500).json({ error: 'Error de la base de datos' });
            }
            res.render('perfil.ejs', { result: result[0], session: req.session, mensaje: mensaje, facultades: facultades });

        });
    });
});

// Metodo para editar los datos del perfil
router.post('/editar/:id', multerFactory.single('imagen'), (req, res) => {
    const { email, nombre, apellido1, apellido2, facultad, curso, grupo } = req.body;
    let imagen;
    // Verifica si se ha subido una nueva imagen
    if (req.file && req.file.buffer) {
        // Si hay una nueva imagen, utiliza su buffer directamente
        imagen = req.file.buffer;
    } else if (req.session.orgIcono) {
        // Decodifica los datos binarios de Base64 a buffer
        imagen = Buffer.from(req.session.imagen, 'base64');
    }
    daoUser.updateUser(req, nombre, apellido1, apellido2, facultad, curso, grupo, email, imagen, (err) => {
        if (err) {
            return res.status(500).json({ error: 'Error de la base de datos' });
        }
        else{
            req.session.imagen = imagen;
            res.redirect('/perfil?mensaje=' + encodeURIComponent(err));
        }
    });
});

// Metodo para logout
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Error interno del servidor');
        }
        return res.redirect('/');
    });
});

// Metodo para realizar una instalacion
router.post('/realizar_reserva', (req, res) => {
    const {instalacionId, dia, hora, aforo} = req.body;
    const email = req.session.email;
    daoUser.getNumReservas(instalacionId, dia, hora, (err, numReservas) => {
        if (err) {
            return res.status(500).send('Error al eliminar la reserva');
        }
        if(numReservas >= aforo){
            return res.redirect('/reserva/'+ instalacionId + '?mensaje=' + encodeURIComponent('Aforo lleno. Por favor, elige otra hora.'));
        }
        else{
            daoinstalaciones.reservaInstalacion(instalacionId, dia, hora, email, (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Error de la base de datos' });
                }
                return res.redirect('/reserva/'+ instalacionId + '?mensaje=' + encodeURIComponent('null'));
            });
        }
    });
});

// Metodo para mostrar emails de un usuario
router.get('/email', (req, res) => {
    const mensaje = req.query.mensaje || "";

    daoUser.getEmailsUser(req.session.email, (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Error de la base de datos' });
        } 

        // Formatear la fecha en cada email
        const results = result.map(email => {
            email.fecha = formatearFecha(email.fecha);
            return email;
        });

        return res.render('email', { results: results, session: req.session, mensaje: mensaje });
    });
});

// Función para formatear la fecha
function formatearFecha(fecha) {
    const opciones = { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' };
    return new Date(fecha).toLocaleDateString('es-ES', opciones);
}

// Metodo para mostrar un email en concreto
router.get('/email/:id', (req, res) => {
    const id = req.params.id;

    daoUser.getEmail(id, (err, email) => {
        if (err) {
            return res.status(500).json({ error: 'Error de la base de datos' });
        }
        if(email.leido == '0'){
            daoUser.leerEmail(id, (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Error de la base de datos' });
                }
            });
        }
        email.fecha = formatearFecha(email.fecha);
        return res.render('email_individual', { result: email, session: req.session });
    });
});

// Metodo para enviar un email
router.post('/email', (req, res) => {
    const { destinatario, asunto, mensaje } = req.body;
    const email_envio = req.session.email;

    daoUser.insertEmail(email_envio, destinatario, asunto, mensaje, (err) => {
        if (err) {
            return res.status(500).json({ error: 'Error de la base de datos' });
        } 
        res.redirect('/email?mensaje=' + encodeURIComponent("Email enviado correctamente."));
    });
});

// Metodo para mostrar una instalacion
router.get('/reserva/:id', (req, res) => {
    const id = req.params.id;
    const mensaje = req.query.mensaje || ""; // Recupera el mensaje de la consulta, si está presente

    daoinstalaciones.getInstalacion(id, (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Error de la base de datos' });
        }
        daoinstalaciones.obtenerReservasPorInstalacion(id, (err, reservas) => {
            if (err) {
                return res.status(500).json({ error: 'Error de la base de datos' });
            }
            return res.render('reserva', { results: results, session: req.session, reservas : reservas, mensaje : mensaje});
        });
    });

});

// Metodo para validar email al mandar un email
router.get('/validarEmail', (req, res) => {
    const email = req.query.email;

    // Lógica para comprobar si el usuario existe, pertenece a la misma facultad o tiene rol de admin
    daoUser.checkEmail(email, (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Error de la base de datos' });
        }

        // Realiza las comprobaciones adicionales según tus requisitos
        const usuarioValido = results && results.length > 0 && 
        ((results[0].rol === '1' || req.session.rol === '1') ||
         (results[0].facultad === req.session.facultad));    


        // Ejemplo de mensaje y respuesta
        if (usuarioValido) {
            return res.send({ success: true, mensaje: 'Usuario válido' });
        } else {
            return res.send({ success: false, error: 'El usuario tiene que existir y pertenecer a la misma facultad que usted o el usuario debe ser un administrador.' });
        }
    });
});

// Metodo para buscar instalacion
router.get('/buscar', (req, res) => {
    const searchTerm = req.query.nombreBuscar;
    daoinstalaciones.searchInstalaciones(searchTerm, (err, instalaciones) => {
        if (err) {
            return res.status(500).json({ error: 'Error de la base de datos' });
        }

        return res.render('home.ejs', { results: instalaciones, session: req.session });  
    });
});

// Metodo para mostrar reservas de un usuario
router.get('/reservas_usuario',(req, res) => {
    const email = req.session.email;
    daoUser.reservasUser(email, (err, reservas) => {
        if (err) {
            return res.status(500).send('Error en la base de datos 123');
        }
        // Verificar si reservas es null o undefined, y asignar un array vacío si es así
        reservas = reservas || [];
        const instalacionesIds = reservas.map(reserva => {
            return reserva.instId;
        });        // Obtener nombres de destinos correspondientes a los IDs de reservas
        daoUser.getNombresInstalaciones(instalacionesIds, (err, nombresInstalaciones) => {
            if (err) {
                return res.status(500).send(err);
            }            let reservasConNombresInst = [];            
            reservas.forEach(reserva => {
                const nombreInstalacion = nombresInstalaciones.find(instalacion => {
                    return instalacion.id == reserva.instId;
                });
                const fechaReserva = new Date(reserva.dia);
                const horaReserva = reserva.hora;
                const fechaFormateada = fechaReserva.toLocaleDateString('en-US'); // 'en-US' representa el formato YYYY/MM/DD, ajusta según tu necesidad
                reservasConNombresInst.push({
                    id: reserva.Id,
                    instalacion_nombre: nombreInstalacion ? nombreInstalacion.nombre : 'Nombre de instalacion no encontrado',
                    fecha_reserva: fechaFormateada,
                    hora_reserva: horaReserva
                });

            });
            return res.render('mostrarReservas.ejs', { session: req.session, results: reservasConNombresInst });
        });
    });
});

// Eliminar reserva del usuario
router.post('/reservas_usuario', (req, res) => {
    const idReserva = req.body.reservaId;
    // Use the reservation ID to fetch details including instId and fecha_reserva
    daoUser.obtenerReserva(idReserva, (err, reservaDetails) => {
        if (err) {
            return res.status(500).send('Error al obtener detalles de la reserva');
        }
        const instId = reservaDetails[0].instId;
        const fechaReserva = reservaDetails[0].dia;
        // Now you have instId and fechaReserva, you can use them as needed
        daoUser.obtenerListaEsperaInfo(instId, fechaReserva, (err, results) => {
            if (err) {
                return res.status(500).send('Error al obtener información de la lista de espera');
            }
            if (results.length > 0) {
                // Process only the first row in the waiting list
                const filaListaEspera = results[0];

                // Delete the row from the waiting list
                daoUser.eliminarListaEspera(filaListaEspera.id, (err) => {
                    if (err) {
                        return res.status(500).send('Error al eliminar de la lista de espera');
                    }
                    // Call insertEmail to send an email to the user
                    const correo_envia = 'Sistema@ucm.com';  // Set the sender's email address
                    const correo_destino = filaListaEspera.usuEmail; // Set the recipient's email address
                    const asunto = '¡Reserva Disponible!';
                    const mensaje = 'Se ha liberado una reserva para la fecha ' + fechaReserva + ' en la instalación ' + filaListaEspera.instalacion_nombre + '.';

                    daoUser.insertEmail(correo_envia, correo_destino, asunto, mensaje, (err) => {
                        if (err) {
                            return res.status(500).send('Error al enviar el correo');
                        }
                    });
                });
            }
            daoUser.eliminarReserva(idReserva, (err) => {
                if (err) {
                    return res.status(500).send('Error al eliminar la reserva');
                }
                return res.redirect('/reservas_usuario');
            });
        });
    });
});

// Metodo para obtener horas disponibles de una instalacion en un dia en concreto
router.post('/obtener_horas_disponibles', (req, res) => {
    const idInstalacion= req.body.instalacionId;
    const fecha = req.body.fecha;
    daoUser.gethoras(idInstalacion, fecha, (err, data) => {
        if (err) {
            return res.status(500).send('Error al obtener las horas.');
        }
        res.json({ horasDisponibles: data });
    });
});

// Metodo para apuntar en la lista de espera a un usuario
router.post('/lista_espera', (req, res) => {
    const idInstalacion = req.body.instalacionId;
    const fecha = req.body.fecha;
    const usuario = req.body.usuario;
    daoUser.apuntarListaEspera(idInstalacion, fecha, usuario, (err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Error al apuntarse en la lista.' });
        }
        res.json({ success: true, message: 'Te has apuntado a la lista de espera con éxito.' });
    });
});


module.exports = router;
