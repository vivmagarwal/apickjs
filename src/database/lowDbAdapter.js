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
    let queryParams = ctx?.query;
    let id = ctx?.params?.id;
    let body = ctx?.request?.body;

    await this.db.read();

    let data = this.db.data[collectionName];
    let xTotalCount = data.length;

    if (id) {
      data = applyCustomFilters(data, [["id", id]]);
    }

    if (queryParams && Object.keys(queryParams).length > 0) {
      // while writing adapters make sure that the data is in the form of an array.
      data = getFilteredDataHandler(data, queryParams);
    }

    ctx && ctx.set && ctx.set("X-Total-Count", xTotalCount);

    return data;
  }

  async read(collectionName) {
    await this.db.read();
    let data = this.db.data[collectionName];
    return data;
  }

  async find(collectionName, filterOptions) {
    // filterOptions = [['id',1],['title','someting']]

    await this.db.read();
    let data = this.db.data[collectionName];
    return applyCustomFilters(data, filterOptions);
  }

  async getCollections() {
    await this.db.read();
    return this.db.data;
  }

  async getMaxId(collectionName) {
    await this.db.read();

    // Check if the collection exists
    if (!this.db.data[collectionName]) {
      return 0;
    }

    // Get the max id
    const maxId = this.db.data[collectionName].reduce((max, item) => {
      return item.id > max ? item.id : max;
    }, 0);

    return maxId;
  }

  async insert(collectionName, doc) {
    await this.db.read();
    this.db.data[collectionName].push(doc);
    await this.db.write();
    return doc;
  }

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

  async createCollection(collectionName) {
    await this.db.read();

    // Check if the collection already exists
    if (this.db.data[collectionName]) {
      throw new Error(`Collection ${collectionName} already exists`);
    }

    // Create a new collection by adding a new array to the data
    this.db.data[collectionName] = [];

    // Write the changes to the database
    await this.db.write();
  }
}

export default LowDBAdapter;
