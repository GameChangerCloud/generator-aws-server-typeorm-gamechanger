import {
  Scalars,
  schemaParser,
  Relationships,
  isBasicScalar,
  isScalar,
  getSQLTableName,
  matchString,
  formatName,
  getFieldsParsedHandler,
  getFieldsCreate,
  getFieldsName,
  getFieldsDirectiveNames,
  getRequire,
  getGraphqlType,
  getEnumValues,
  getAllTables,
  getInitEachFieldsModelsJS,
  isSchemaValid,
  getRelations,
  getJoinTables,
  getQuerySelfJoinOne,
  getQuerySelfJoinMany,
  typesGenerator,
  Type,
  isPersonalizedScalar,
} from 'easygraphql-parser-gamechanger';

import UnhandledGraphqlTypeError from './templates/src/error/unhandled-graphql-type.error';
import { exec } from 'child_process';
import * as util from 'util';

const Generator = require('yeoman-generator');
const pluralize = require('pluralize');

const manageScalars = {
  isBasicScalar,
  isScalar,
};

module.exports = class extends Generator {
  // The name `constructor` is important hereh
  constructor(args, opts) {
    super(args, opts);

    // Project Name
    this.argument('appName', { required: true });

    // Graphql schema
    this.argument('graphqlFile', { type: String, required: true });
  }

  /** Base run loop lifecycle */

  //Your initialization methods (checking current project state, getting configs, etc)
  initializing() {
    this.log('Initializing');
  }

  // Where you prompt users for options (where you’d call this.prompt())
  async prompting() {
    this.log('Prompting');
    this.log('Please answer these information to set up your project');
    this.answers = await this._askProjectProperties();

    // Checking if project already existing
    if (this.fs.exists(this.answers.name + '/graphql/schema.ts')) {
      this.log(
        'Warning : Project already existing, all the types not corresponding will be removed, press Enter to confirm or ctrl+c to abort'
      );
      this.override = await this.prompt([
        {
          type: 'confirm',
          name: 'value',
          message: "I know what I'm doing",
        },
      ]);

      if (this.override.value) {
        this.override = true;
        this.file_old_json = this.fs.read(this.answers.name + '/schema.json');
      }
    }
  }

  // Saving configurations and configure the project (creating .editorconfig files and other metadata files)
  configuring() {
    this.log('Configuring');
  }

  // Get the graphql file
  reading() {
    this.log('Reading');
    if (
      this.options.graphqlFile &&
      this.options.graphqlFile.includes('.graphql')
    ) {
      this.log('Fetching schema from ' + this.options.graphqlFile);
      this.schema = this.fs.read(this.options.graphqlFile);

      // Parsing as a JSON object
      this.schemaJSON = schemaParser(this.schema);
      this.log('Type Generation started'); //, util.inspect(this.schemaJSON, false, null, true))
      this.types = Type.initTypes(this.schemaJSON);
      let isValidSchema = isSchemaValid(this.types);
      if (isValidSchema.response) {
        throw new Error(
          'Incorrect schema, please write a valid graphql schema based on the supported guidelines.\nReason: ' +
            isValidSchema.reason
        );
      }
      this.types = getRelations(this.types);
    } else {
      this.log('Invalid graphql schema');
      return 0;
    }
  }

  // If the method name doesn’t match a priority, it will be pushed to this group.
  default() {
    this.log('Default');
  }

  // Where you write the generator specific files (routes, controllers, etc)
  writing() {
    this.log('Writing');
    // Move the root directory to perform the scaffolding
    this.destinationRoot(this.options.appName);
    this.fs.writeJSON('schema.json', this.schemaJSON);

    // All the potential types linked by interface
    this.typesInterface = [];

    // Will hold all the interfaces that each type depends on (0 to N)
    this.interfaces = null;

    const typesNameArray = this.types.map((type) => type.typeName);

    for (let index = 0; index < this.types.length; index++) {
      const currentType = this.types[index] as Type;
      this.log('Processing TYPE : ' + currentType.typeName);
      this.log(util.inspect(currentType, false, null, true));

      // Get the graphqlType
      const graphqlType = getGraphqlType(currentType);
      console.log('graphql type : ', graphqlType);

      if (graphqlType === 'GraphQLInterfaceType') {
        this._processGraphQLInterfaceType(currentType);
      } else if (graphqlType === 'GraphQLEnumType') {
        this._processGraphQLEnumType(currentType);
      } else if (graphqlType === 'GraphQLScalarType') {
        this._processGraphQLScalarType(currentType);
      } else if (graphqlType === 'GraphQLObjectType') {
        // Should be GraphQLObjectType
        this._processGraphQLObjectType(
          currentType,
          typesNameArray,
        );
      } else {
        throw new UnhandledGraphqlTypeError(graphqlType);
      }

      this.log('\n');
    }

    //Adding the handler.ts file (main handler)
    this.fs.copyTpl(
      this.templatePath('src/graphql/globalHandler.ejs'),
      this.destinationPath('src/graphql/handler.js'),
      { types: this.types }
    );

    //Adding the datasource.ts file (typeorm)
    this.fs.copyTpl(
      this.templatePath('src/typeorm/datasource.ejs'),
      this.destinationPath('src/typeorm/datasource.ts'),
      { types: this.types }
    );

    //Adding a sample test.ts file (for typeorm objects)
    this.fs.copyTpl(
      this.templatePath('src/typeorm/test.ejs'),
      this.destinationPath('src/typeorm/test.ts'),
      { types: this.types }
    );

    // Entry point of the lambdas function for index.ts
    let importUpdateLine = '';
    let requestUpdate = '';
    this.fs.copyTpl(
      this.templatePath('src/index.js'),
      this.destinationPath('src/index.ts'),
      {
        importUpdate: importUpdateLine,
        updateRequest: requestUpdate,
      }
    );

    /** Adding Terraform Files **/
    //Adding file for API Gateway
    this.fs.copyTpl(
      this.templatePath('terraform/apigateway.tf'),
      this.destinationPath('terraform/apigateway.tf'),
      {
        appName: formatName(this.answers.name),
      }
    );
    //Adding file for Cognito
    this.fs.copyTpl(
      this.templatePath('terraform/cognito.tf'),
      this.destinationPath('terraform/cognito.tf'),
      {
        appName: formatName(this.answers.name),
      }
    );
    //Adding file for IAM
    this.fs.copyTpl(
      this.templatePath('terraform/iam.tf'),
      this.destinationPath('terraform/iam.tf'),
      {
        appName: formatName(this.answers.name),
      }
    );
    //Adding file for Lambdas
    this.fs.copyTpl(
      this.templatePath('terraform/lambda.tf'),
      this.destinationPath('terraform/lambda.tf')
    );
    //Adding file for the main
    this.fs.copyTpl(
      this.templatePath('terraform/main.tf'),
      this.destinationPath('terraform/main.tf')
    );
    //Adding file for RDS
    this.fs.copyTpl(
      this.templatePath('terraform/rds.tf'),
      this.destinationPath('terraform/rds.tf')
    );
    //Adding file for secret
    this.fs.copyTpl(
      this.templatePath('terraform/secret.tf'),
      this.destinationPath('terraform/secret.tf')
    );
    //Adding file for variables
    this.fs.copyTpl(
      this.templatePath('terraform/variables.tf'),
      this.destinationPath('terraform/variables.tf')
    );
    //Adding terraform.tfvar file
    this.fs.copyTpl(
      this.templatePath('terraform/terraform.tfvar'),
      this.destinationPath('terraform/terraform.tfvar'),
      {
        appName: formatName(this.answers.name),
      }
    );
    /** Adding lambda local test dependencies **/
    this.fs.copyTpl(
      this.templatePath('testLambdas/template.yaml'),
      this.destinationPath('src/template.yaml'),
      {
        appName: formatName(this.answers.name),
      }
    );

    // Adding launch.json file for sam configuration
    this.fs.copyTpl(
      this.templatePath('samConfiguration/launch.json'),
      this.destinationPath('src/.vscode/launch.json')
    );

    /** Adding README file **/
    this.fs.copyTpl(
      this.templatePath('readmes/AWS-SETUP-TEST.md'),
      this.destinationPath('src/AWS-SETUP-TEST.md'),
      {
        appName: formatName(this.answers.name),
      }
    );

    /** Adding tsconfig.json file **/
    this.fs.copyTpl(
      this.templatePath('tsconfig.json'),
      this.destinationPath('tsconfig.json'),
      {}
    );

    /** Adding package.json file **/
    this.fs.copyTpl(
      this.templatePath('package.json'),
      this.destinationPath('package.json'),
      {
        appName: this.answers.name,
        appDescription: this.answers.description,
        appVersion: this.answers.version,
        appAuthor: this.answers.author,
      }
    );
  }

  // Where conflicts are handled (used internally)
  conflicts() {
    this.log('Conflicts');
  }

  // Where installations are run (npm, bower)
  install() {
    this.log('Install');
    // todo : Do we really need pg ? rds-data dependancy should be removed by using RDSDataService
    //this.npmInstall(['graphql', 'pg', 'rds-data', 'chance', 'validator', 'graphql-scalars'])
    //this.npmInstall(['aws-sdk', 'prettier'], {'save-dev': true});
    this.addDependencies({ 'graphql': '16.5.0' });
    this.addDependencies({ 'graphql-scalars': '1.17.0' });
    this.addDependencies({ 'typeorm': '0.3.6' });
    this.addDependencies({ 'reflect-metadata': '0.1.13' });
    this.addDependencies({ 'pg': '8.7.3' });
    this.addDependencies({ '@types/aws-lambda': '^8.10.101' });


    this.addDevDependencies({ prettier: '2.7.1' });
    this.addDevDependencies({ '@types/node': '^17.0.21' });
    this.addDevDependencies({ typescript: '^4.6.2' });

    exec('prettier --write .');
  }

  // Called last, cleanup, say good bye, etc
  end() {
    this.log(
      'Done, now use the terraform commands writtent in README.md to deploy your lambdas'
    );
  }

  // PRIVATE SECTION

  private async _askProjectProperties() {
    return this.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Your project name',
        default: this.options.appName,
      },
      {
        type: 'input',
        name: 'description',
        message: 'Project description',
        default: 'none',
      },
      {
        type: 'input',
        name: 'version',
        message: 'Project version',
        default: '1.0.0',
      },
      {
        type: 'input',
        name: 'author',
        message: 'Project author',
        default: '',
      },
    ]);
  }

  private _processGraphQLObjectType(
    currentType,
    typesNameArray
  ) {
    // Check if it implements an interface (array non empty)
    if (currentType.implementedTypes[0]) {
      // Check if this.typesInterface is already initialised
      this.typesInterface.push(currentType.typeName + 'Type');

      if (!this.interfaces) {
        this.interfaces = [];
      }
      currentType.implementedTypes.forEach((interfaceElement) => {
        this.interfaces.push(interfaceElement + 'Type');
      });
    }

    // Reset this.interface array for the next object
    this.interfaces = null;

    // No need for a queryType handler
    if (currentType.isNotOperation()) {
      const directiveNames = getFieldsDirectiveNames(currentType);
      // Adding the type.js file
      this.fs.copyTpl(
        this.templatePath('src/typeorm/type.ejs'),
        this.destinationPath(
          'src/typeorm/entities/' + currentType.typeName + '.ts'
        ),
        {
          type: currentType,
        }
      );

      // Adding events for lambdas
      //Create
      this.fs.copyTpl(
        this.templatePath('testLambdas/eventMaker.ejs'),
        this.destinationPath('events/create' + currentType.typeName + '.json'),
        {
          fields: currentType.fields,
          typeName: currentType.typeName,
          typeQuery: 'create',
        }
      );
      //Delete
      this.fs.copyTpl(
        this.templatePath('testLambdas/eventMaker.ejs'),
        this.destinationPath('events/delete' + currentType.typeName + '.json'),
        {
          fields: currentType.fields,
          typeName: currentType.typeName,
          typeQuery: 'delete',
        }
      );

      //Update
      this.fs.copyTpl(
        this.templatePath('testLambdas/eventMaker.ejs'),
        this.destinationPath('events/update' + currentType.typeName + '.json'),
        {
          fields: currentType.fields,
          typeName: currentType.typeName,
          typeQuery: 'update',
        }
      );
    }
  }

  private _processGraphQLScalarType(currentType) {
    if (!isPersonalizedScalar(currentType.typeName)) {
      this.fs.copyTpl(
        this.templatePath('src/graphql/typeScalar.ejs'),
        this.destinationPath(
          'src/graphql/types/' + currentType.typeName.toLowerCase() + '.ts'
        )
      );
    }
  }

  private _processGraphQLEnumType(currentType) {
    this.fs.copyTpl(
      this.templatePath('src/graphql/typeEnum.ejs'),
      this.destinationPath(
        'src/graphql/types/' + currentType.typeName.toLowerCase() + '.ts'
      ),
      {
        enumName: currentType.typeName,
        enumValues: getEnumValues(currentType),
      }
    );
    this.log('Content created for enum');
  }

  private _processGraphQLInterfaceType(currentType) {
    // Check if this.typesInterface is already initialised
    this.typesInterface.push(currentType.typeName + 'Type');

    // Adding the types graphql files
    this.fs.copyTpl(
      this.templatePath('src/graphql/type.ejs'),
      this.destinationPath(
        'src/graphql/types/' + currentType.typeName.toLowerCase() + '.ts'
      ),
      {
        type: currentType,
        graphqlType: 'GraphQLInterfaceType', //EnumType, ObjectType, InterfaceType
        interfaces: null, // An interface doesn't implement other interface
      }
    );
  }
};
