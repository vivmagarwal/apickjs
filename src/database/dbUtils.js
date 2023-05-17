export function fullTextSearch(data, query) {
  return data.filter((item) =>
    Object.values(item).some((value) =>
      String(value).toLowerCase().includes(query.toLowerCase())
    )
  );
}

export function applyCustomFilters(data, customFilters) {
  console.log(data, customFilters)
  console.log('#########')

  const filteredData = [];

  for (const item of data) {
    let matchesAllFilters = true;

    for (const [param, value] of customFilters) {
      const operatorMatch = param.match(/(.+)(_gte|_lte|_ne|_like)$/);

      if (operatorMatch) {
        const [, originalParam, operator] = operatorMatch;

        switch (operator) {
          case "_gte":
            if (
              item.hasOwnProperty(originalParam) &&
              item[originalParam] < value
            ) {
              matchesAllFilters = false;
            }
            break;
          case "_lte":
            if (
              item.hasOwnProperty(originalParam) &&
              item[originalParam] > value
            ) {
              matchesAllFilters = false;
            }
            break;
          case "_ne":
            if (
              item.hasOwnProperty(originalParam) &&
              item[originalParam] == value
            ) {
              matchesAllFilters = false;
            }
            break;
          case "_like":
            if (
              item.hasOwnProperty(originalParam) &&
              !item[originalParam].includes(value)
            ) {
              matchesAllFilters = false;
            }
            break;
        }
      } else if (item.hasOwnProperty(param) && item[param] != value) {
        matchesAllFilters = false;
      }

      if (!matchesAllFilters) {
        break;
      }
    }

    if (matchesAllFilters) {
      filteredData.push(item);
    }
  }

  return filteredData;
}

export function sortData(data, sortKeys, sortOrder) {
  return data.sort((a, b) => {
    for (let i = 0; i < sortKeys.length; i++) {
      const key = sortKeys[i];
      const order = sortOrder[i] === "desc" ? -1 : 1;

      if (a[key] < b[key]) {
        return -1 * order;
      } else if (a[key] > b[key]) {
        return order;
      }
    }
    return 0;
  });
}

export function getFilteredDataHandler(data, queryParams) {
  // Full-text search
  if (queryParams.q) {
    data = fullTextSearch(data, queryParams.q);
  }

  // Sorting
  if (queryParams._sort) {
    const sortKeys = queryParams._sort.split(",");
    const sortOrder = queryParams._order
      ? queryParams._order.split(",")
      : sortKeys.map(() => "asc");

    data = sortData(data, sortKeys, sortOrder);
  }

  // Custom filter for any other query parameters
  const filterKeys = ["q", "_sort", "_order", "_limit", "_page"];
  const customFilters = Object.entries(queryParams).filter(
    ([param]) => !filterKeys.includes(param)
  );
  data = applyCustomFilters(data, customFilters);

  // Pagination
  if (queryParams._limit !== undefined || queryParams._page !== undefined) {
    const limit = parseInt(queryParams._limit, 10) || 10;
    const page = parseInt(queryParams._page, 10) || 1;
    data = getPaginatedDataHandler(data, limit, page);
  }

  return data;
  // const response = new Response(JSON.stringify(data), { status: 200 });
  // return Promise.resolve(response);
}

export function getPaginatedDataHandler(data, limit, page) {
  const start = (page - 1) * limit;
  const end = start + limit;
  const paginatedData = data.slice(start, end);
  return paginatedData;
}