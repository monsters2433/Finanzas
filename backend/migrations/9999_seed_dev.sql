-- Datos de ejemplo para desarrollo local.
-- La contraseña de este usuario es "password123" (hash PBKDF2 de ejemplo NO válido:
-- crea el usuario mejor vía POST /api/auth/signup para tener un hash real).
-- Aquí solo se siembran datos de dominio para un user_id fijo de pruebas.

INSERT OR IGNORE INTO users (id, email, name, currency, locale, plan)
VALUES ('demo-user', 'demo@ciclo.app', 'Demo', 'EUR', 'es-ES', 'free');

INSERT OR IGNORE INTO subscriptions (id, user_id, nombre, importe, moneda, ciclo, fecha, categoria, aviso, metodo, pausado) VALUES
  ('sub1','demo-user','Netflix',13.99,'EUR','mensual', date('now','+10 day'),'streaming',3,'Visa ····4321',0),
  ('sub2','demo-user','Spotify',11.99,'EUR','mensual', date('now','+2 day'),'streaming',2,'',0),
  ('sub3','demo-user','Fibra + móvil',42.00,'EUR','mensual', date('now','+1 day'),'telefonia',3,'Domiciliación',0),
  ('sub4','demo-user','Seguro del coche',210.00,'EUR','semestral', date('now','+40 day'),'finanzas',14,'',0);

INSERT OR IGNORE INTO incomes (id, user_id, nombre, importe, moneda, ciclo) VALUES
  ('inc1','demo-user','Nómina',1950,'EUR','mensual');

INSERT OR IGNORE INTO expenses (id, user_id, concepto, importe, moneda, fecha, categoria) VALUES
  ('exp1','demo-user','Supermercado',84.35,'EUR', date('now','-3 day'),'hogar'),
  ('exp2','demo-user','Gasolina',52.00,'EUR', date('now','-1 day'),'otros');

INSERT OR IGNORE INTO goals (id, user_id, emoji, nombre, objetivo) VALUES
  ('goal1','demo-user','✈️','Viaje a Japón',4000),
  ('goal2','demo-user','🛟','Colchón de emergencia',6000);

INSERT OR IGNORE INTO contributions (id, goal_id, amount, date) VALUES
  ('c1','goal1',300, date('now','-60 day')),
  ('c2','goal1',350, date('now','-30 day')),
  ('c3','goal2',500, date('now','-30 day'));
