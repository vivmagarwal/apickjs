import { LowSync } from 'lowdb'
import { JSONFileSync } from 'lowdb/node'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// db.json file path
const __dirname = dirname(fileURLToPath(import.meta.url))


class LowDBAdapter {
  constructor(dbName) {
    // const file = join(__dirname, dbName)
    const file = "db.json"
    this.db = new LowSync(new JSONFileSync(file),{"posts": [{id: 1}]})
  }

  async getCollections(){
    await this.db.read();
    return this.db.data;
  }

  async getEntries(collectionName) {
    await this.db.read();
    if (!this.db.data[collectionName]) {
      this.db.data[collectionName] = [];
      await this.db.write();
    }
    return this.db.data[collectionName];
  }

  async find(collectionName, query) {
    await this.db.read();
    return this.db.data[collectionName].filter(query);
  }

  async findOne(collectionName, query) {
    await this.db.read();
    return this.db.data[collectionName].find(query);
  }

  async insert(collectionName, doc) {
    await this.db.read();
    this.db.data[collectionName].push(doc);
    await this.db.write();
    return doc;
  }

  async update(collectionName, doc) {
    await this.db.read();
    const index = this.db.data[collectionName].findIndex(({ id }) => id === doc.id);
    if (index !== -1) {
      this.db.data[collectionName][index] = doc;
      await this.db.write();
    }
    return doc;
  }

  async remove(collectionName, doc) {
    await this.db.read();
    const index = this.db.data[collectionName].findIndex(({ id }) => id === doc.id);
    if (index !== -1) {
      this.db.data[collectionName].splice(index, 1);
      await this.db.write();
    }
    return doc;
  }
}

export default LowDBAdapter;

