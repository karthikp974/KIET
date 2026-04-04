const useMysql = Boolean(
  process.env.DATABASE_URL ||
    (process.env.MYSQLHOST &&
      process.env.MYSQLUSER &&
      (process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE))
);

if (useMysql) {
  module.exports = require("./store-mysql");
  module.exports.backend = "mysql";
} else {
  module.exports = require("./store-fs");
  module.exports.backend = "fs";
}
