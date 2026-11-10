import { IDatabaseService } from '../../infrastructure/database/contracts/database.contract.js';

export interface IWarehouseModuleDependencies {
  readonly databaseService: IDatabaseService;
}

/**
 * Warehouse Feature Module Composition Root
 */
export class WarehouseModule {
  private readonly dependencies: IWarehouseModuleDependencies;

  public constructor(dependencies: IWarehouseModuleDependencies) {
    this.dependencies = dependencies;
  }

  public getDependencies(): IWarehouseModuleDependencies {
    return this.dependencies;
  }
}

