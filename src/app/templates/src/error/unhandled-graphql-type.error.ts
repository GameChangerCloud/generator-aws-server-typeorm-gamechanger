export default class UnhandledGraphqlTypeError extends Error {
    constructor(graphqlType) {
        super(`Unhandled graphql type : [${graphqlType}]`);
    }
}