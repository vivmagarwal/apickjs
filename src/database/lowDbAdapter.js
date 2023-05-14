import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { applyCustomFilters, getFilteredDataHandler } from "./dbUtils.js";

// db.json file path
const __dirname = dirname(fileURLToPath(import.meta.url));

class LowDBAdapter {
  constructor(dbName) {
    // const file = join(__dirname, dbName)
    const file = "db.json";
    this.db = new LowSync(new JSONFileSync(file), { posts: [{ id: 1 }] });
  }

  async get(collectionName, ctx) {
    let queryParams = ctx.query;
    let id = ctx.params.id;
    let body = ctx.request.body;

    await this.db.read();

    let data = this.db.data[collectionName];
    let xTotalCount = data.length;
  
    if (id) {
      data = applyCustomFilters(data, [['id', id]]);
    }
  
    if (Object.keys(queryParams).length > 0) {
      // while writing adapters make sure that the data is in the form of an array.
      data = getFilteredDataHandler(data, queryParams);
    }

    ctx.set('X-Total-Count', xTotalCount);
    return data;
  }  

  async getCollections() {
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

  // async update(collectionName, doc) {
  //   await this.db.read();
  //   const index = this.db.data[collectionName].findIndex(({ id }) => id === doc.id);
  //   if (index !== -1) {
  //     this.db.data[collectionName][index] = doc;
  //     await this.db.write();
  //   }
  //   return doc;
  // }

  async update(collectionName, id, doc) {
    await this.db.read();

    const index = this.db.data[collectionName].findIndex(
      ({ id: currentId }) => currentId == id
    );

    if (index !== -1) {
      // Update existing document
      let collectionID = doc.id;
      let idObj = { id: collectionID };

      this.db.data[collectionName][index] = { ...idObj, ...doc };
    } else {
      // Insert new document
      this.db.data[collectionName].push({ ...doc, id });
    }
    await this.db.write();

    return { id, ...doc };
  }

  async patch(collectionName, id, doc) {
    await this.db.read();

    const index = this.db.data[collectionName].findIndex(
      ({ id: currentId }) => currentId == id
    );

    if (index !== -1) {
      // Merge existing document with new data
      this.db.data[collectionName][index] = {
        ...this.db.data[collectionName][index],
        ...doc,
      };
      await this.db.write();

      return this.db.data[collectionName][index];
    }

    // If no matching document found, return null or throw an error
    return null;
  }

  async remove(collectionName, doc) {
    await this.db.read();
    const index = this.db.data[collectionName].findIndex(
      ({ id }) => id === doc.id
    );
    if (index !== -1) {
      this.db.data[collectionName].splice(index, 1);
      await this.db.write();
    }
    return doc;
  }
}

export default LowDBAdapter;
